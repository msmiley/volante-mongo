const volante = require('volante');
const MongoClient = require('mongodb').MongoClient;
const MongoOplog = require('mongo-oplog');

//
// Class manages a mongodb connection and emits events on connect and when
// a watched namespace is changed.
//
class VolanteMongo extends volante.Spoke {
  //
  // volante init()
  //
  init() {
    // default options
    this.options = {
      dbhost: '127.0.0.1',
      dbname: 'test',
      dbopts: {},
      oplog: false,
      rsname: '$main'
    };

    // the reference to the driver mongo.Db object
    this.db = null;

    // watched namespaces
    this.watched = [];

    // event api
    this.hub.on('volante-mongo.connect', (opts) => {
      this.connect(opts);
    });
    this.hub.on('volante-mongo.watch', (coll) => {
      this.watch(coll);
    });
  }

  //
  // Process the provided options and connect to mongodb
  //
  connect(opts) {
    // merge options
    Object.assign(this.options, opts);

    this.log(`Connecting to mongodb at ${this.options.dbhost}`);

    var fullhost = this.options.dbhost;

    // add full mongodb:// schema if not provided
    if (!fullhost.match(/^mongodb:\/\/.*/)) {
      fullhost = `mongodb://${this.options.dbhost}/${this.options.dbname}`;
    }

    // initiate connect
    MongoClient
    .connect(fullhost, this.options.dbopt)
    .then(db => this.success(db))
    .catch(err => this.error(err));
  }

  //
  // watch the specified namespace for changes
  //
  watch(collection) {
    this.options.oplog = true; // set to true as convenience
    if (this.watched.indexOf(collection) === -1) {
      this.debug(`watching the ${collection} collection`);
      this.watched.push(collection);
    }
  }

  //
  // Receives the freshly connected db object from the mongodb native driver
  //
  success(db) {
    this.log(`Connected to mongodb at ${this.options.dbhost}`);

    // save to instance variable
    this.db = db;

    this.hub.emit('volante-mongo.connected', this.db);
    if (this.options.oplog && this.watched.length > 0) {
      this.tailOplog();
    }

    // error on connection close
    this.db.on('close', () => {
      this.log(`mongodb disconnected from ${this.options.dbhost}`);
      this.hub.emit('volante-mongo.disconnected');
    });

  }

  //
  // Start tailing the mongodb oplog
  //
  tailOplog() {
    this.debug("initializing oplog connection");

    this.oplog = MongoOplog(`mongodb://${this.options.dbhost}/local`, {
      ns: `${this.db.s.databaseName}.(${this.watched.join('|')})`,
      coll: `oplog.${this.options.rsname}`
    });

    this.oplog.on('insert', (doc) => {
      this.hub.emit(`volante-mongo.insert`, {
        ns: doc.ns,
        _id: doc.o._id,
        o: doc.o
      });
    });

    this.oplog.on('update', (doc) => {
      this.hub.emit(`volante-mongo.update`, {
        ns: doc.ns,
        _id: doc.o2._id, // use the o2 object instead
        o: doc.o
      });
    });

    this.oplog.on('delete', (doc) => {
      this.hub.emit(`volante-mongo.delete`, {
        ns: doc.ns,
        _id: doc.o._id,
        o: doc.o
      });
    });

    this.oplog.on('error', (err) => {
      this.error(err);
    });

    // start the oplog tailing
    this.oplog.tail()
    .then(() => this.debug('oplog tailing started'))
    .catch((err) => this.error(err));
  }

}

//
// exports
//
module.exports = VolanteMongo;