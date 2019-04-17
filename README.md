# Volante MongoDb Spoke

volante module for mongodb

Provides simple connection using the native mongodb node.js driver.
All events follow the Volante hub/spoke model and are emitted on the hub.

## Usage

```bash
npm install volante-mongo
```

Volante modules are automatically loaded and instanced if they are installed locally and `hub.attachAll()` is called.

## Props

Options are changed using the `VolanteMongo.update` event with an options object:

```js
hub.emit('VolanteMongo.update', {
  dbhost: "127.0.0.1",  // mongod address
  dbopts: {},           // options object passed to driver on connect
  retryInterval: 10000, // retry timeout when mongo connection lost
  handleCrud: false,    // flag to enable generid crud handlers (volante.read, etc...)
});
```

> The module will automatically start a connection when the props are changed.

## Events

### Handled

- `VolanteMongo.connect` - start connection, only useful if using the defaults

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
- `mongo.updateOne`
  ```js
  String, // the full namespace (e.g. db.collection)
  String, // the _id of the object to update
  Object, // the update operation (see https://docs.mongodb.com/manual/reference/operator/update/)
  Function // the callback to call when the operation is complete
  ```
- `mongo.deleteOne`
  ```js
  String, // the full namespace (e.g. db.collection)
  String, // the _id of the object to delete
  Function // the callback to call when the operation is complete
  ```
- `mongo.aggregate`
  ```js
  String, // the full namespace (e.g. db.collection)
  Array, // the aggregation pipeline (see https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/)
  Function // the callback to call when the operation is complete
  ```
- `mongo.watch`
  ```js
  String, // the full namespace (e.g. db.collection)
  Array, // the aggregation pipeline used to filter for ChangeStream events
  Function // the callback to call when watch operation is triggered
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
- `VolanteMongo.disconnected` - on disconnect or connection loss

## License

ISC