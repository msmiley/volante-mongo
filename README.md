# Volante MongoDb Spoke

volante module for mongodb

Provides simple connection using the native mongodb node.js driver, as well as
oplog monitoring for specified collections. All events follow the Volante hub/spoke
model and are emitted on the hub.

## Usage

```bash
npm install volante-mongo
```

Volante modules are automatically loaded and instanced if they are installed locally and `hub.attachAll()` is called.

## Props

Options are changed using the `VolanteMongo.props` event with an options object:

```js
hub.emit('VolanteMongo.props', {
  dbhost: "127.0.0.1",  // mongod address
  dbopts: {},           // options object passed to driver on connect
  oplog: false,         // flag to enable oplog monitoring
  rsname: '$main',      // replica-set name (only used when oplog: true)
  retryInterval: 10000, // retry timeout when mongo connection lost
  handleCrud: false,    // flag to enable crud handlers (volante.read, etc...)
});
```

> The module will automatically start a connection when the props are changed.

## Events

### Handled

- `VolanteMongo.connect` - start connection, really only useful if using the defaults
- `VolanteMongo.watch`
  ```js
  String // collection name to watch
  ```
  > Note: oplog option is forced to true if this event is emitted

#### Mongo API

- `mongo.insertOne`
  ```js
  String, // the full namespace (e.g. db.collection)
  Object, // the document to create
  Function // the callback to call when the operation is complete
  ```
- `mongo.find`
  ```js
  String, // the full namespace (e.g. db.collection)
  Object, // the object to use as a query (this may include implementation-specific constructs)
  Function // the callback to call when the operation is complete
  ```
- `volante.updateOne`
  ```js
  String, // the full namespace (e.g. db.collection)
  String, // the _id of the object to update
  Object, // the update operation (see https://docs.mongodb.com/manual/reference/operator/update/)
  Function // the callback to call when the operation is complete
  ```
- `volante.deleteOne`
  ```js
  String, // the full namespace (e.g. db.collection)
  String, // the _id of the object to delete
  Function // the callback to call when the operation is complete
  ```


#### CRUD Handling

When `handleCrud` is set to true, VolanteMongo will handle the following Volante CRUD interface:

- `volante.create`
  ```js
  String, // the name of the collection/table/directory
  Object, // the object to create
  Function // the callback to call when the operation is complete
  ```
- `volante.read`
  ```js
  String, // the name of the collection/table/directory
  Object, // the object to use as a query (this may include implementation-specific constructs)
  Function // the callback to call when the operation is complete
  ```
- `volante.update`
  ```js
  String, // the name of the collection/table/directory
  String, // the `id` of the object to update
  Object, // an object containing either the full replacement content, or implementation-specific update mechanisms
  Function // the callback to call when the operation is complete
  ```
- `volante.delete`
  ```js
  String, // the name of the collection/table/directory
  String, // the `id` of the object to delete
  Function // the callback to call when the operation is complete
  ```


### Emitted

In addition to native Volante log events, this modules also emits:

- `VolanteMongo.connected` - on connected with Db object
  ```js
  mongo.Db // native driver Db object, can be used for any db driver calls
  ```
- `VolanteMongo.insert` - only when `oplog: true`
  ```js
  {
    ns: String,          // full namespace
    coll: String,        // collection name only
    _id: mongo.ObjectId, // _id of inserted doc
    o: Object            // entire inserted doc
  }
  ```
- `VolanteMongo.update` - only when `oplog: true`
  ```js
  {
    ns: String,          // full namespace
    coll: String,        // collection name only
    _id: mongo.ObjectId, // _id of updated doc
    o: Object            // query mathing object
  }
  ```
- `VolanteMongo.delete` - only when `oplog: true`
  ```js
  {
    ns: String,          // full namespace
    coll: String,        // collection name only
    _id: mongo.ObjectId, // _id of deleted doc
    o: Object            // object provided by oplog
  }
  ```
- `VolanteMongo.disconnected` - on disconnect or connection loss

## License

ISC