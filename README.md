# Volante MongoDb Spoke

volante module for mongodb

Provides simple connection using the native mongodb node.js driver, as well as
oplog monitoring for specified collections. All events follow the volante hub/spoke
model and are emitted on the hub.

## Usage

```bash
npm install volante-mongo
```

Volante modules are automatically loaded and instanced if they are installed locally and `hub.attachAll()` is called.

## Options

Options are changed using the `volante-mongo.connect` event with an options object:

```js
hub.emit('volante-mongo.connect', {
  dbhost: "127.0.0.1", // mongod address
  dbname: "test",      // mongo database name to open
  dbopts: {},          // options object passed to driver on connect
  oplog: false,        // flag to enable oplog monitoring
  rsname: '$main'      // replica-set name (only used when oplog: true)
});
```

## Events

### Handled

- `volante-mongo.connect`
  ```js
  {
    dbhost: String,
    dbname: String,
    dbopts: Object,
    oplog: Boolean,
    rsname: String
  }
  ```
- `volante-mongo.watch`
  ```js
  String // collection name to watch
  ```
  > Note: oplog option is forced to true if this event is emitted


### Emitted

In addition to native Volante log events, this modules also emits:

- `volante-mongo.connected` - on connected with Db object
  ```js
  mongo.Db // native driver Db object
  ```
- `volante-mongo.insert` - only when `oplog: true`
  ```js
  {
    ns: String,          // full namespace
    coll: String,        // collection name only
    _id: mongo.ObjectId, // _id of inserted doc
    o: Object            // entire inserted doc
  }
  ```
- `volante-mongo.update` - only when `oplog: true`
  ```js
  {
    ns: String,          // full namespace
    coll: String,        // collection name only
    _id: mongo.ObjectId, // _id of updated doc
    o: Object            // query mathing object
  }
  ```
- `volante-mongo.delete` - only when `oplog: true`
  ```js
  {
    ns: String,          // full namespace
    coll: String,        // collection name only
    _id: mongo.ObjectId, // _id of deleted doc
    o: Object            // object provided by oplog
  }
  ```
- `volante-mongo.disconnected` - on disconnect or connection loss

## License

ISC