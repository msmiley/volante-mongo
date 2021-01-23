const mongo = require('mongodb');
const MongoClient = mongo.MongoClient;

//
// Class manages a mongodb connection and emits events on connect and when
// a watched namespace is changed.
//
module.exports = {
  name: 'VolanteMongo',
  init() {
    if (this.configProps) {
      this.$log('attempting to connect using config props');
      this.connect();
    }
  },
  events: {
    // force connect (only necessary if defaults are used, otherwise, emit a
    // 'VolanteMongo.update' event with the proper info)
    'VolanteMongo.connect'() {
      this.connect();
    },
    //
    // Volante CRUD API overlay
    //
    'volante.create'(name, obj, callback) {
      this.handleCrud && this.insertOne(name, obj, {}, callback);
    },
    'volante.read'(name, query, callback) {
      this.handleCrud && this.find(name, query, {}, callback);
    },
    'volante.update'(name, id, obj, callback) {
      this.handleCrud && this.updateOne(name, { _id: mongo.ObjectID(id) }, { $set: obj }, {}, callback);
    },
    'volante.delete'(name, id, callback) {
      this.handleCrud && this.deleteOne(name, { _id: mongo.ObjectID(id) }, {}, callback);
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
      this.findOne(ns, { _id: mongo.ObjectID(_id) }, options, callback);
    },
    'mongo.updateOne'(ns, filter, update, options, callback) {
      this.updateOne(...arguments);
    },
    'mongo.updateById'(ns, _id, update, options, callback) {
      this.updateOne(ns, { _id: mongo.ObjectID(_id) }, update, options, callback);
    },
    'mongo.deleteOne'(ns, filter, options, callback) {
      this.deleteOne(...arguments);
    },
    'mongo.deleteById'(ns, _id, options, callback) {
      this.deleteOne(ns, { _id: mongo.ObjectID(_id) }, options, callback);
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
  },
  done() {
    if (this.client) {
      this.client.close(true);
      this.client = null;
      this.$log('MongoClient closed');
    }
  },
  props: {
    handleCrud: false, // flag whether module should listen for crud events
    host: '127.0.0.1',
    port: 27017,
    dbopts: { // native node.js driver options
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
    retryInterval: 10000,
    namespaces: {},
  },
  data() {
    return {
      client: null, // MongoClient object
      watched: [],  // watched namespaces
    };
  },
  updated() {
    this.handleCrud && this.$log('listening for volante CRUD operations');
    this.connect();
  },
  methods: {
    //
    // Process the provided options and connect to mongodb
    //
    connect() {
      this.$log(`Connecting to mongodb at: ${this.host}`);

      var fullhost = this.host;

      // add full mongodb:// schema if not provided
      if (!fullhost.match(/^mongodb:\/\/.*/)) {
        fullhost = `mongodb://${this.host}:${this.port}`;
      }
      this.$debug(`full mongo url: ${fullhost}`);

      // initiate connect
      MongoClient
      .connect(fullhost, this.dbopts)
      .then(client => this.success(client))
      .catch(err => this.mongoError(err));
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
        // rehydrate _id
        if (query._id && typeof(query._id) === 'string') {
          query._id = mongo.ObjectID(query._id);
        }
        this.$isDebug && this.$debug('find', ns, query);
        let coll = this.getCollection(ns);
        if (typeof(query) === 'string') {
          this.findOne(ns, { _id: mongo.ObjectID(query) }, options, callback);
        } else {
          coll.find(query, options).toArray((err, docs) => {
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
        // rehydrate _id
        if (query._id && typeof(query._id) === 'string') {
          query._id = mongo.ObjectID(query._id);
        }
        this.$isDebug && this.$debug('findOne', ns, query);
        let coll = this.getCollection(ns);
        coll.findOne(query, options, (err, doc) => {
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
        // rehydrate _id in filter
        if (filter._id && typeof(filter._id) === 'string') {
          filter._id = mongo.ObjectID(filter._id);
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
    deleteOne(ns, filter, ...optionsAndCallback) {
      let { options, callback } = this.handleSkippedOptions(...optionsAndCallback);
      if (this.client) {
        this.$isDebug && this.$debug('deleteOne', ns, filter);
        // rehydrate _id
        if (filter._id && typeof(filter._id) === 'string') {
          filter._id = mongo.ObjectID(filter._id);
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
        this.getCollection(ns).watch(pipeline, { fullDocument: 'updateLookup' }).on('change', (data) => {
          callback && callback(null, data);
        }).on('error', err => this.mongoError(err));
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
        // rehydrate _id
        if (query._id && typeof(query._id) === 'string') {
          query._id = mongo.ObjectID(query._id);
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
      if (typeof(ns) !== 'string') {
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
        return this.client.db(sns[0]).collection(sns[1]);
      }
    },
    //
    // handle skipped options param
    // i.e. callback provided in options place
    //
    handleSkippedOptions(options, callback) {
      if (typeof(options) === 'function') {
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
  },
};
