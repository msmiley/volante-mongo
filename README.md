# Volante MongoDb Handler

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


### Emitted

- `volante-mongo.connected` - on connected with Db object
  ```js
  mongo.Db // native driver Db object
  ```
- `volante-mongo.insert` - only when `oplog: true`
  ```js
  {
    ns: String,
    _id: mongo.ObjectId,
    o: Object
  }
  ```
- `volante-mongo.update` - only when `oplog: true`
  ```js
  {
    ns: String,
    _id: mongo.ObjectId,
    o: Object
  }
  ```
- `volante-mongo.delete` - only when `oplog: true`
  ```js
  {
    ns: String,
    _id: mongo.ObjectId,
    o: Object
  }
  ```
- `volante-mongo.disconnected` - on disconnect or connection loss

## License

ISC