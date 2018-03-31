const MongoClient = require('mongodb').MongoClient;
const MongoOplog = require('mongo-oplog');

//
// Class manages a mongodb connection and emits events on connect and when
// a watched namespace is changed.
//
module.exports = {
	name: 'VolanteMongo',
  //
  // volante init()
  //
  init() {
    // the reference to the driver mongo.Db object
    this.db = null;

    // watched namespaces
    this.watched = [];
	},
	events: {
    'VolanteMongo.connect'(opts) {
      this.connect(opts);
    },
    'VolanteMongo.watch'(coll) {
      this.watch(coll);
    },
  },
	props: {
    dbhost: '127.0.0.1',
    dbname: 'test',
    dbopts: {},
    oplog: false,
    rsname: '$main',
  },
	methods: {
		//
		// Process the provided options and connect to mongodb
		//
		connect(opts) {
		  // merge options
		  Object.assign(this, opts);

		  this.log(`Connecting to mongodb at ${this.dbhost}`);

		  var fullhost = this.dbhost;

		  // add full mongodb:// schema if not provided
		  if (!fullhost.match(/^mongodb:\/\/.*/)) {
		    fullhost = `mongodb://${this.dbhost}/${this.dbname}`;
		  }

		  // initiate connect
		  MongoClient
		  .connect(fullhost, this.dbopt)
		  .then(db => this.success(db))
		  .catch(err => this.error(err));
		},
		//
		// watch the specified namespace for changes
		//
		watch(collection) {
		  this.oplog = true; // set to true as convenience
		  if (this.watched.indexOf(collection) === -1) {
		    this.debug(`watching the ${collection} collection`);
		    this.watched.push(collection);
		  }
		},
		//
		// Receives the freshly connected db object from the mongodb native driver
		//
		success(db) {
		  this.log(`Connected to mongodb at ${this.dbhost}`);

		  // save to instance variable
		  this.db = db;

		  this.$hub.emit('VolanteMongo.connected', this.db);
		  if (this.oplog && this.watched.length > 0) {
		    this.tailOplog();
		  }

		  // error on connection close
		  this.db.on('close', () => {
		    this.log(`mongodb disconnected from ${this.dbhost}`);
		    this.$hub.emit('VolanteMongo.disconnected');
		  });
		},
		//
		// Start tailing the mongodb oplog
		//
		tailOplog() {
		  this.debug("initializing oplog connection");

		  this.mongoOplog = MongoOplog(`mongodb://${this.dbhost}/local`, {
		    ns: `${this.db.s.databaseName}.(${this.watched.join('|')})`,
		    coll: `oplog.${this.rsname}`
		  });

		  this.mongoOplog.on('insert', (doc) => {
		    this.$hub.emit(`VolanteMongo.insert`, {
		      ns: doc.ns,
		      coll: this.getCollection(doc.ns),
		      _id: doc.o._id,
		      o: doc.o
		    });
		  });

		  this.mongoOplog.on('update', (doc) => {
		    this.$hub.emit(`VolanteMongo.update`, {
		      ns: doc.ns,
		      coll: this.getCollection(doc.ns),
		      _id: doc.o2._id, // use the o2 object instead
		      o: doc.o
		    });
		  });

		  this.mongoOplog.on('delete', (doc) => {
		    this.$hub.emit(`VolanteMongo.delete`, {
		      ns: doc.ns,
		      coll: this.getCollection(doc.ns),
		      _id: doc.o._id,
		      o: doc.o
		    });
		  });

		  this.mongoOplog.on('error', (err) => {
		    this.error(err);
		  });

		  // start the oplog tailing
		  this.mongoOplog.tail()
		  .then(() => this.debug('oplog tailing started'))
		  .catch((err) => this.error(err));
		},
		//
		// Get collection name from full namespace
		//
		getCollection(ns) {
		  return ns.split('.').pop();
		},
	},
}
