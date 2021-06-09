const mongo = require('mongodb');
const MongoClient = mongo.MongoClient;

//
// module manages a mongodb connection and emits events on connect and when
// a watched namespace is changed.
//
module.exports = {
  name: 'VolanteMongo',
  props: {
    enabled: true,     // global enable flag, won't connect if false
    host: '127.0.0.1', // mongo host
    port: 27017,       // mongo port
    dbopts: {          // native node.js driver options
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
    retryInterval: 10000,     // connect retry interval
    namespaces: {},           // namespace dictionary for centralized management of namespaces
    promoteIds: true,         // flag if volante-mongo should attempt to promote strings to _id
    allowedUpdateOperators: [ // operators exempt from sanitize
      '$set',
      '$addToSet',
      '$pullAll',
      '$pull',
      '$inc',
      '$push',
      '$each',
    ],
  },
  init() {
    if (this.configProps && this.enabled) {
      this.$log('attempting to connect using config props');
      this.connect();
    }
  },
  events: {
    // request a call to connect()
    // (only necessary if defaults are used, otherwise, emit a
    // 'VolanteMongo.update' event with the proper info), or use the volante config file
    'mongo.connect'() {
      this.connect();
    },
    //
    // standard mongo-specific API
    //
    'mongo.insertOne'(ns, doc, options, callback) {
      this.insertOne(...arguments);
    },
    'mongo.insertMany'(ns, docs, options, callback) {
      this.insertMany(...arguments);
    },
    'mongo.find'(ns, query, options, callback) {
      this.find(...arguments);
    },
    'mongo.findOne'(ns, query, options, callback) {
      this.findOne(...arguments);
    },
    'mongo.findById'(ns, _id, options, callback) {
      this.findOne(ns, { _id }, options, callback);
    },
    'mongo.updateOne'(ns, filter, update, options, callback) {
      this.updateOne(...arguments);
    },
    'mongo.updateMany'(ns, filter, update, options, callback) {
       this.updateMany(...arguments);
    },
    'mongo.updateById'(ns, _id, update, options, callback) {
      this.updateOne(ns, { _id }, update, options, callback);
    },
    'mongo.deleteMany'(ns, filter, options, callback) {
      this.deleteMany(...arguments);
    },
    'mongo.deleteOne'(ns, filter, options, callback) {
      this.deleteOne(...arguments);
    },
    'mongo.deleteById'(ns, _id, options, callback) {
      this.deleteOne(ns, { _id }, options, callback);
    },
    'mongo.aggregate'(ns, pipeline, options, callback) {
      this.aggregate(...arguments);
    },
    'mongo.watch'(ns, pipeline, callback) {
      this.watch(...arguments);
    },
    'mongo.distinct'(ns, field, query, options, callback) {
      this.distinct(...arguments);
    },
    'mongo.count'(ns, query, options, callback) {
      this.count(...arguments);
    },
    'mongo.joinById'(ns, query, foreignKey, foreignNs, options, callback) {
      this.joinById(...arguments);
    },
    'mongo.createIndexes'(ns, indexes, callback) {
      this.createIndexes(...arguments);
    },
    'mongo.openUploadStream'(ns, filename, options, callback) {
      this.openUploadStream(...arguments);
    },
    'mongo.openDownloadStream'(ns, fileId, options, callback) {
      this.openDownloadStream(...arguments);
    },
    'mongo.deleteFile'(ns, fileid, callback) {
      this.deleteFile(...arguments);
    },
  },
  done() {
    if (this.client) {
      this.client.close(true);
      this.client = null;
      this.$log('MongoClient closed');
    }
  },
  data() {
    return {
      client: null, // MongoClient object
      watched: [], // watched namespaces
      mongo // access to the driver pkg
    };
  },
  updated() {
    this.connect();
  },
  methods: {
    //
    // Process the provided options and connect to mongodb
    //
    connect() {
      if (this.enabled) {
        this.$log(`Connecting to mongodb at: ${this.host}`);

        var fullhost = this.host;

        // add full mongodb:// schema if not provided
        if (!fullhost.match(/^mongodb:\/\/.*/)) {
          fullhost = `mongodb://${this.host}:${this.port}`;
        }
        this.$debug(`full mongo url: ${fullhost}`);

        // initiate connect
        MongoClient.connect(fullhost, this.dbopts)
        .then((client) => this.success(client))
        .catch((err) => this.mongoError(err));
      } else {
        this.$warn('refusing to connect because enabled=false');
      }
    },
    //
    // Receives the freshly connected db object from the mongodb native driver
    //
    success(client) {
      this.$log(`Connected to mongodb at ${this.host}`);

      // save to instance variable
      this.client = client;

      // alert subscribers that mongo is connected, if they need a reference to the client,
      // they should use this.$hub.get('VolanteMongo').client
      this.$emit('VolanteMongo.connected');
      this.$emit('mongo.connected');

      // attach events to admin db
      let db = client.db('admin');

      // error on connection close
      db.on('close', () => {
        this.$log(`mongodb disconnected from ${this.host}`);
        this.$emit('VolanteMongo.disconnected');
      });
      // announce a reconnect
      db.on('reconnect', () => {
        this.$log(`mongodb reconnected to ${this.host}`);
        this.$emit('VolanteMongo.connected');
      });
    },
    //
    // mongo error handler
    //
    mongoError(err) {
      // black hole certain errors
      if (err.codeName === 'NotMasterNoSlaveOk') return;
      // log it
      this.$error('mongo error', err);
      if (err.errno === 'ECONNREFUSED' ||
        err.errno === 'EHOSTDOWN' ||
        err.name === 'MongoNetworkError' ||
				err.name === 'MongoServerSelectionError') {
        this.$log(`retrying in ${this.retryInterval}ms`);
        setTimeout(() => this.connect(), this.retryInterval);
      }
    },
    //
    // Use mongodb node.js driver insertOne()
    //
    insertOne(ns, doc, ...optionsAndCallback) {
      let { options, callback } = this.handleSkippedOptions(...optionsAndCallback);
      if (this.client) {
        this.$isDebug && this.$debug('insertOne', ns, doc);
        this.getCollection(ns).insertOne(doc, options, (err, result) => {
          if (err) {
            this.$error('mongo error', err);
            callback && callback(err);
          } else {
            callback && callback(null, result);
          }
        });
      } else {
        callback && callback(this.$error('db client not ready'));
      }
    },
    //
    // Use mongodb node.js driver insertMany()
    //
    insertMany(ns, docs, ...optionsAndCallback) {
      let { options, callback } = this.handleSkippedOptions(...optionsAndCallback);
      if (this.client) {
        this.$isDebug && this.$debug('insertMany', ns, docs);
        this.getCollection(ns).insertMany(docs, options, (err, result) => {
          if (err) {
            this.$error('mongo error', err);
            callback && callback(err);
          } else {
            callback && callback(null, result);
          }
        });
      } else {
        callback && callback(this.$error('db client not ready'));
      }
    },
    //
    // Use mongodb node.js driver find()
    //
    find(ns, query, ...optionsAndCallback) {
      let { options, callback } = this.handleSkippedOptions(...optionsAndCallback);
      if (this.client) {
        // see if we need to rehydrate _id
        if (query._id) {
          query._id = this.checkId(query._id);
        }
        this.$isDebug && this.$debug('find', ns, query);
        if (typeof query === 'string') {
          // assume the string is an _id and try to fetch it
          this.findOne(ns, { _id: this.checkId(query) }, options, callback);
        } else {
          this.getCollection(ns).find(query, options).toArray((err, docs) => {
            if (err) {
              this.$error('mongo error', err);
              callback && callback(err);
            } else {
              callback && callback(null, docs);
            }
          });
        }
      } else {
        callback && callback(this.$error('db client not ready'));
      }
    },
    //
    // Use mongodb node.js driver findOne()
    //
    findOne(ns, query, ...optionsAndCallback) {
      let { options, callback } = this.handleSkippedOptions(...optionsAndCallback);
      if (this.client) {
        // see if we need to rehydrate _id
        if (query._id) {
          query._id = this.checkId(query._id);
        }
        this.$isDebug && this.$debug('findOne', ns, query);
        this.getCollection(ns).findOne(query, options, (err, doc) => {
          if (err) {
            this.$error('mongo error', err);
            callback && callback(err);
          } else {
            callback && callback(null, doc);
          }
        });
      } else {
        callback && callback(this.$error('db client not ready'));
      }
    },
    updateOne(ns, filter, update, ...optionsAndCallback) {
      let { options, callback } = this.handleSkippedOptions(...optionsAndCallback);
      if (this.client) {
        // see if we need to rehydrate _id in filter
        if (filter._id) {
          filter._id = this.checkId(filter._id);
        }
        // make sure update doesn't try to change _id
        if (update.$set) {
          delete update.$set._id;
        }
        this.$isDebug && this.$debug('updateOne', ns, filter, update);
        this.getCollection(ns).updateOne(filter, update, options, (err, result) => {
          if (err) {
            this.$error('mongo error', err);
            callback && callback(err);
          } else {
            callback && callback(null, result);
          }
        });
      } else {
        callback && callback(this.$error('db client not ready'));
      }
    },
    updateMany(ns, filter, update, ...optionsAndCallback) {
      let { options, callback } = this.handleSkippedOptions(...optionsAndCallback);
      if (this.client) {
        // see if we need to rehydrate _id in filter
        if (filter._id) {
          filter._id = this.checkId(filter._id);
        }
        // make sure update doesn't try to change _id
        if (update.$set) {
          delete update.$set._id;
        }
        this.$isDebug && this.$debug('updateMany', ns, filter, update);
        this.getCollection(ns).updateMany(filter, update, options, (err, result) => {
          if (err) {
            this.$error('mongo error', err);
            callback && callback(err);
          } else {
            callback && callback(null, result);
          }
        });
      } else {
        callback && callback(this.$error('db client not ready'));
      }
    },
    deleteMany(ns, filter, ...optionsAndCallback) {
      let { options, callback } = this.handleSkippedOptions(...optionsAndCallback);
      if (this.client) {
        this.$isDebug && this.$debug('deleteMany', ns, filter);
        this.getCollection(ns).deleteMany(filter, options, (err, result) => {
          if (err) {
            this.$error('mongo error', err);
            callback && callback(err);
          } else {
            callback && callback(null, result);
          }
        });
      } else {
        callback && callback(this.$error('db client not ready'));
      }
    },
    deleteOne(ns, filter, ...optionsAndCallback) {
      let { options, callback } = this.handleSkippedOptions(...optionsAndCallback);
      if (this.client) {
        this.$isDebug && this.$debug('deleteOne', ns, filter);
        // see if we need to rehydrate _id in filter
        if (filter._id) {
          filter._id = this.checkId(filter._id);
        }
        this.getCollection(ns).deleteOne(filter, options, (err, result) => {
          if (err) {
            this.$error('mongo error', err);
            callback && callback(err);
          } else {
            callback && callback(null, result);
          }
        });
      } else {
        callback && callback(this.$error('db client not ready'));
      }
    },
    aggregate(ns, pipeline, ...optionsAndCallback) {
      let { options, callback } = this.handleSkippedOptions(...optionsAndCallback);
      if (this.client) {
        this.$isDebug && this.$debug('aggregate', ns, pipeline);
        this.getCollection(ns).aggregate(pipeline, options, (err, cursor) => {
          if (err) {
            this.$error('mongo error', err);
            callback && callback(err);
          } else {
            cursor.toArray((err, docs) => {
              if (err) {
                callback && callback(err);
              } else {
                callback && callback(null, docs);
              }
            });
          }
        });
      } else {
        callback && callback(this.$error('db client not ready'));
      }
    },
    watch(ns, pipeline, callback) {
      if (this.client) {
        this.$log(`watching ${ns} for changes with pipeline:`, pipeline);
        this.getCollection(ns).watch(pipeline, { fullDocument: 'updateLookup' })
        .on('change', (data) => {
          callback && callback(null, data);
        })
        .on('error', (err) => this.mongoError(err));
      } else {
        callback && callback(this.$error('db client not ready'));
      }
    },
    distinct(ns, field, query, ...optionsAndCallback) {
      let { options, callback } = this.handleSkippedOptions(...optionsAndCallback);
      if (this.client) {
        this.$isDebug && this.$debug('distinct', ns, field, query);
        this.getCollection(ns).distinct(field, query || {}, options, (err, result) => {
          if (err) {
            this.$error('mongo error', err);
            callback && callback(err);
          } else {
            callback && callback(null, result);
          }
        });
      } else {
        callback && callback(this.$error('db client not ready'));
      }
    },
    count(ns, query, ...optionsAndCallback) {
      let { options, callback } = this.handleSkippedOptions(...optionsAndCallback);
      if (this.client) {
        // see if we need to rehydrate _id
        if (query._id) {
          query._id = this.checkId(query._id);
        }
        this.$isDebug && this.$debug('count', ns, query);
        this.getCollection(ns).countDocuments(query, options, (err, result) => {
          if (err) {
            this.$error('mongo error', err);
            callback && callback(err);
          } else {
            callback && callback(null, result);
          }
        });
      }
    },
    // custom left outer join function, uses Promises to join in a foreign document
    // looked up by _id. foreignKey will contain array of foreign document matches
    joinById(ns, query, foreignKey, foreignNs, ...optionsAndCallback) {
      let { options, callback } = this.handleSkippedOptions(...optionsAndCallback);
      if (this.client) {
        this.getCollection(ns).find(query, options).toArray((err, docs) => {
          if (err) {
            return this.$error('mongo error', err);
          }
          let subOps = [];
          // for all docs in left collection which match the query
          for (let d of docs) {
            let q;
            // pull out the foreign key
            let fk = d[foreignKey];
            // support arrays of foreign keys
            if (Array.isArray(fk)) {
              let aryOfOid = [];
              for (let k of fk) {
                aryOfOid.push(this.checkId(k));
              }
              q = { _id: { $in: aryOfOid }};
            } else {
              q = { _id: this.checkId(fk) };
            }
            // add a promise which retrieves the doc from the foreign collection by id
            subOps.push(new Promise((resolve, reject) => {
              this.getCollection(foreignNs).find(q).toArray((err, foreignDocs) => {
                if (err) {
                  return reject(err);
                }
                d[foreignKey] = foreignDocs;
                resolve(d);
              });
            }));
          }
          // perform the lookups and return after they're all collected in an array
          Promise.all(subOps).then((rslt) => {
            callback && callback(null, rslt);
          });
        });
      }
    },
    //
    // call the mongo createIndexes function, this one takes the raw index spec
    // https://docs.mongodb.com/manual/reference/command/createIndexes/
    //
    createIndexes(ns, indexes, callback) {
      if (this.client) {
        this.$isDebug && this.$debug('createIndexes', ns, indexes);
        this.getCollection(ns).createIndexes(indexes, (err, result) => {
          if (err) {
            this.$error('mongo error', err);
            callback && callback(err);
          } else {
            callback && callback(null, result);
          }
        });
      }
    },
    //
    // upload a file to mongo gridfs
    //
    openUploadStream(ns, filename, ...optionsAndCallback) {
      let { options, callback } = this.handleSkippedOptions(...optionsAndCallback);
      if (this.client) {
        this.$isDebug && this.$debug('openUploadStream', ns);
        var bucket = new mongo.GridFSBucket(this.getDatabase(ns), {
          bucketName: ns,
        });
        var uploadStream = bucket.openUploadStream(filename, options);
        callback && callback(null, uploadStream);
      }
    },
    //
    // download a file from mongo gridfs
    //
    openDownloadStream(ns, fileId, ...optionsAndCallback) {
      let { options, callback } = this.handleSkippedOptions(...optionsAndCallback);
      if (this.client) {
        this.$isDebug && this.$debug('openDownloadStream', ns);
        var bucket = new mongo.GridFSBucket(this.getDatabase(ns), {
          bucketName: ns,
        });
        var downloadStream = bucket.openDownloadStream(mongo.ObjectID(fileId), options);
        callback && callback(null, downloadStream);
      }
    },
    //
    // delete a file from mongo gridfs
    //
    deleteFile(ns, fileId, callback) {
      if (this.client) {
        this.$isDebug && this.$debug('deleteFile', ns);
        var bucket = new mongo.GridFSBucket(this.getDatabase(ns), {
          bucketName: ns,
        });
        bucket.delete(mongo.ObjectID(fileId), (err, result) => {
          if (err) {
            this.$error('mongo error', err);
            callback && callback(err);
          } else {
            callback && callback(null, result);
          }
        });
      }
    },
    ///////////////////////////////////////////////////
    // UTILITY FUNCTIONS START HERE
    ///////////////////////////////////////////////////
    //
    // split namespace into db and collection name
    //
    splitNamespace(ns) {
      let s = ns.split('.');
      if (s.length > 1) {
        return [s[0], s.splice(1).join('.')];
      }
      return s;
    },
    //
    // Get the native driver Collection object for the given namespace.
    //
    getCollection(ns) {
      if (typeof ns !== 'string') {
        throw this.$error('not valid namespace');
      } else {
        let sns = this.splitNamespace(ns);
        if (sns.length === 1) {
          // if provided string is not full namespace, try to lookup in
          // this.namespaces and use the value as the namespace
          let configNs = this.namespaces[ns];
          if (configNs) {
            sns = this.splitNamespace(configNs);
          } else {
            this.$error('cannot find namespace in config');
          }
        }

        // handle gridfs collections that end with .files or .chunks
        if (sns.length === 3) {
          return this.client.db(sns[0]).collection(`${sns[1]}.${sns[2]}`);
        }

        return this.client.db(sns[0]).collection(sns[1]);
      }
    },
    //
    // Get the database for the given namespace
    //
    getDatabase(ns) {
      if (typeof ns !== 'string') {
        throw this.$error('not valid namespace');
      } else {
        let sns = this.splitNamespace(ns);
        if (sns.length === 1) {
          // if provided string is not full namespace, try to lookup in
          // this.namespaces and use the value as the namespace
          let configNs = this.namespaces[ns];
          if (configNs) {
            sns = this.splitNamespace(configNs);
          } else {
            this.$error('cannot find namespace in config');
          }
        }
        return this.client.db(sns[0]);
      }
    },
    // handle skipped options param
    // i.e. callback provided in options place
    //
    handleSkippedOptions(options, callback) {
      if (typeof options === 'function') {
        return {
          options: {},
          callback: options,
        };
      }
      return {
        options,
        callback,
      };
    },
    //
    // Check provided _id and promote it to an ObjectID if
    // it's a string and promoteIds prop is true,
    // this method can be used by user modules instead of having to call mongo.ObjectId directly
    //
    checkId(_id) {
      // check to see if this can be an ObjectID
      if (this.promoteIds && typeof(_id) === 'string' && _id.length === 24) {
        return mongo.ObjectID(_id);
      }
      this.$isDebug && this.$debug(`checkId won't promote ${_id} to an ObjectID, make sure that is what you expect`);
      return _id;
    },
    //
    // helper function to find $-prefixed object keys
    //
    recursiveSearch(obj, results = []) {
      Object.keys(obj).forEach((key) => {
        if (key.startsWith('$')) {
          results.push(key);
        }
        if (typeof obj[key] === 'object') {
          this.recursiveSearch(obj[key], results);
        }
      });
      return results;
    },
    //
    // basic express.js middleware to sanitize a request body for mongo operators
    // allowed operators can be set through the props
    //
    sanitize(req, res, next) {
      let keys = this.recursiveSearch(req.body);
      for (let k of keys) {
        if (this.allowedUpdateOperators.indexOf(k) < 0) {
          return res.status(400).send(`mongo operator: ${k} not allowed by volante-mongo.sanitize`);
        }
      }
      next();
    },
  },
};
