const mongo = require('mongodb');
const MongoClient = mongo.MongoClient;
const MongoOplog = require('mongo-oplog');

//
// Class manages a mongodb connection and emits events on connect and when
// a watched namespace is changed.
//
module.exports = {
	name: 'VolanteMongo',
	events: {
		// force connect (only necessary if defaults are used, otherwise, emit a
		// 'VolanteMongo.props' event with the proper info)
    'VolanteMongo.connect'() {
      this.connect();
    },
    'VolanteMongo.watch'(ns) {
      this.watch(ns);
    },
    // CRUD API overlay
    'volante.create'(ns, doc) {
    	this.handleCrud && this.insertOne(ns, doc);
    },
    'volante.read'(ns, query, callback) {
    	this.handleCrud && this.find(ns, query, callback);
    },
    'volante.update'(ns, id, doc) {
    	this.handleCrud && this.updateOne(ns, id, doc);
    },
    'volante.delete'(ns, id) {
    	this.handleCrud && this.deleteOne(ns, id);
    },
  },
	props: {
		client: null, // MongoClient object
		handleCrud: false, // flag whether module should listen for crud events
		watched: [],  // watched namespaces
    dbhost: '127.0.0.1',
    dbport: 27017,
    dbopts: {
    	useNewUrlParser: true,
    },
    oplog: false,
    rsname: '$main',
    retryInterval: 10000,
    findOptions: {},
  },
	updated() {
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
		  .catch(err => this.error(err));
		},
		//
		// watch the specified namespace for changes
		//
		watch(collection) {
		  this.oplog = true; // set to true as convenience
		  if (this.watched.indexOf(collection) === -1) {
		    this.$debug(`watching the ${collection} collection`);
		    this.watched.push(collection);
		  }
		},
		//
		// Receives the freshly connected db object from the mongodb native driver
		//
		success(client) {
		  this.$log(`Connected to mongodb at ${this.dbhost}`);

		  // save to instance variable
		  this.client = client;

		  this.$emit('VolanteMongo.connected', this.client);
		  if (this.oplog && this.watched.length > 0) {
		    this.tailOplog();
		  }

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
		  	this.$emit('VolanteMongo.connected', this.client);
		  });
		},
		error(err) {
			this.$error(err);
			this.$log(`retrying in ${this.retryInterval}ms`);
			setTimeout(() => this.connect(), this.retryInterval);
		},
		//
		// Use mongodb node.js driver find()
		//
		find(ns, query, callback) {
			if (this.client) {
				this.$isDebug && this.$debug('find', query);
				let coll = this.getCollection(ns);
				if (typeof(query) === 'string') {

					coll.findOne({ _id: mongo.ObjectID(query) }, (err, doc) => {
						if (err) {
							this.$error(err);
						} else {
							callback && callback(doc);
						}
					});
				} else {
					coll.find(query, this.findOptions).toArray((err, docs) => {
						if (err) {
							this.$error(err);
						} else {
							callback && callback(docs);
						}
					});
				}
			} else {
				this.$error('db client not ready');
			}
		},
		//
		// Use mongodb node.js driver insertOne()
		//
		insertOne(ns, doc) {
			if (this.client) {
				this.$isDebug && this.$debug('insertOne', doc);
				this.getCollection(ns).insertOne(doc, (err, result) => {
					if (err) {
						this.$error(err);
					}
				});
			} else {
				this.$error('db client not ready');
			}
		},
		updateOne(ns, id, doc) {
			if (this.client) {
				this.$isDebug && this.$debug('updateOne', id, doc);
				this.getCollection(ns).updateOne({ _id: mongo.ObjectID(id) }, { $set: doc }, (err, result) => {
					if (err) {
						this.$error(err);
					}
				});
			} else {
				this.$error('db client not ready');
			}
		},
		deleteOne(ns, id) {
			if (this.client) {
				this.$isDebug && this.$debug('deleteOne', id);
				this.getCollection(ns).deleteOne({ _id: mongo.ObjectID(id) }, (err, result) => {
					if (err) {
						this.$error(err);
					}
				});
			} else {
				this.$error('db client not ready');
			}
		},
		//
		// Start tailing the mongodb oplog
		//
		tailOplog() {
		  this.$debug("initializing oplog connection");

		  this.mongoOplog = MongoOplog(`mongodb://${this.dbhost}/local`, {
		    ns: `(${this.watched.join('|')})`,
		    coll: `oplog.${this.rsname}`
		  });

		  this.mongoOplog.on('insert', (doc) => {
		    this.$emit(`VolanteMongo.insert`, {
		      ns: doc.ns,
		      coll: this.splitNamespace(doc.ns)[1],
		      _id: doc.o._id,
		      o: doc.o
		    });
		  });

		  this.mongoOplog.on('update', (doc) => {
		    this.$emit(`VolanteMongo.update`, {
		      ns: doc.ns,
		      coll: this.splitNamespace(doc.ns)[1],
		      _id: doc.o2._id, // use the o2 object instead
		      o: doc.o
		    });
		  });

		  this.mongoOplog.on('delete', (doc) => {
		    this.$emit(`VolanteMongo.delete`, {
		      ns: doc.ns,
		      coll: this.splitNamespace(doc.ns)[1],
		      _id: doc.o._id,
		      o: doc.o
		    });
		  });

		  this.mongoOplog.on('error', (err) => {
		  	// ignore certain errors
		  	if (err.message === "No more documents in tailed cursor") return;
		    this.$error(err);
		  });

		  // start the oplog tailing
		  this.mongoOplog.tail()
		  .then(() => this.$debug('oplog tailing started'))
		  .catch((err) => this.$error(err));
		},
		//
		// split namespace into db and collection name
		//
		splitNamespace(ns) {
			let s = ns.split('.');
		  return [s[0], s.splice(1).join('.')];
		},
		getCollection(ns) {
			let sns = this.splitNamespace(ns);
			return this.client.db(sns[0]).collection(sns[1]);
		}
	},
};
