const mongo = require('mongodb');
const MongoClient = mongo.MongoClient;

//
// Class manages a mongodb connection and emits events on connect and when
// a watched namespace is changed.
//
module.exports = {
	name: 'VolanteMongo',
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
    	this.handleCrud && this.find(false, name, query, {}, callback);
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
    'mongo.find'(ns, query, options, callback) {
      this.find(false, ...arguments);
    },
    'mongo.findOne'(ns, query, options, callback) {
      this.find(true, ...arguments);
    },
    'mongo.updateOne'(ns, filter, update, options, callback) {
    	this.updateOne(...arguments);
    },
    'mongo.deleteOne'(ns, filter, options, callback) {
    	this.deleteOne(...arguments);
    },
    'mongo.aggregate'(ns, pipeline, callback) {
    	this.aggregate(...arguments);
    },
    'mongo.watch'(ns, pipeline, callback) {
    	this.watch(...arguments);
    },
    'mongo.distinct'(ns, field, query, callback) {
    	this.distinct(...arguments);
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
    dbhost: '127.0.0.1',
    dbport: 27017,
    dbopts: { // native node.js driver options
    	useNewUrlParser: true,
    },
    retryInterval: 10000,
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
		  this.$log(`Connecting to mongodb at: ${this.dbhost}`);

		  var fullhost = this.dbhost;

		  // add full mongodb:// schema if not provided
		  if (!fullhost.match(/^mongodb:\/\/.*/)) {
		    fullhost = `mongodb://${this.dbhost}:${this.dbport}`;
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
		  this.$log(`Connected to mongodb at ${this.dbhost}`);

		  // save to instance variable
		  this.client = client;

		  this.$emit('VolanteMongo.connected');

			// attach events to admin db
			let db = client.db('admin');

		  // error on connection close
		  db.on('close', () => {
		    this.$log(`mongodb disconnected from ${this.dbhost}`);
		    this.$emit('VolanteMongo.disconnected');
		  });
		  // announce a reconnect
		  db.on('reconnect', () => {
		  	this.$log(`mongodb reconnected to ${this.dbhost}`);
		  	this.$emit('VolanteMongo.connected');
		  });
		},
		mongoError(err) {
			// black hole certain errors
			if (err.codeName === 'NotMasterNoSlaveOk') return;
			// log it
			this.$error('mongo error', err);
			if (err.errno === 'ECONNREFUSED' || err.name === 'MongoNetworkError') {
				this.$log(`retrying in ${this.retryInterval}ms`);
				setTimeout(() => this.connect(), this.retryInterval);
			}
		},
		//
		// Use mongodb node.js driver find()
		//
		find(findOne, ns, query, options, callback) {
			if (this.client) {
				this.$isDebug && this.$debug('find', ns, query);
				let coll = this.getCollection(ns);
				let q = query;
        if (typeof(query) === 'string') {
          q = { _id: mongo.ObjectID(query) };
          findOne = true;
        }
        if (findOne) {
					coll.findOne(q, options, (err, doc) => {
						if (err) {
							this.$error('mongo error', err);
							callback && callback(err);
						} else {
							callback && callback(null, doc);
						}
					});
				} else {
					coll.find(q, options).toArray((err, docs) => {
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
		// Use mongodb node.js driver insertOne()
		//
		insertOne(ns, doc, options, callback) {
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
		updateOne(ns, filter, update, options, callback) {
			if (this.client) {
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
		deleteOne(ns, filter, options, callback) {
			if (this.client) {
				this.$isDebug && this.$debug('deleteOne', ns, filter);
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
		aggregate(ns, pipeline, callback) {
			if (this.client) {
				this.$isDebug && this.$debug('aggregate', ns, pipeline);
				this.getCollection(ns).aggregate(pipeline, {}, (err, cursor) => {
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
				this.$isDebug && this.$debug('watch', ns, pipeline);
				this.getCollection(ns).watch(pipeline, { fullDocument: 'updateLookup' }).on('change', (data) => {
					callback && callback(null, data);
				}).on('error', err => this.mongoError(err));
			} else {
				callback && callback(this.$error('db client not ready'));
			}
		},
		distinct(ns, field, query, callback) {
			if (this.client) {
				this.$isDebug && this.$debug('distinct', ns, field, query);
				this.getCollection(ns).distinct(field, query || {}, {}, (err, result) => {
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
		// split namespace into db and collection name
		//
		splitNamespace(ns) {
			let s = ns.split('.');
		  return [s[0], s.splice(1).join('.')];
		},
		//
		// Get the native driver Collection object for the given namespace.
		//
		getCollection(ns) {
			if (typeof(ns) !== 'string') {
				throw this.$error('not valid namespace');
			} else {
				let sns = this.splitNamespace(ns);
				return this.client.db(sns[0]).collection(sns[1]);
			}
		}
	},
};
