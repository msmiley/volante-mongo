# Volante Mongo Handler

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

Options are changed using the `volante-console.options` event with an options object:

```js
hub.emit('volante-mongo.connect', {
  dbhost: "127.0.0.1", // mongod address
  dbname: "test",      // mongo database name to open
  dbopts: {},          // options object passed to driver on connect
  root: "mongodb"      // root for emitted events (e.g. 'mongodb.connected')
});
```

## Events

- `volante-mongo.connected`
  ```js
  Db // native driver Db object
  ```
- `volante-mongo.insert`
  ```js
  {
    ns: String,
    _id: mongo.ObjectId,
    o: Object
  }
  ```
- `volante-mongo.update`
  ```js
  {
    ns: String,
    _id: mongo.ObjectId,
    o: Object
  }
  ```
- `volante-mongo.delete`
  ```js
  {
    ns: String,
    _id: mongo.ObjectId,
    o: Object
  }
  ```

## License

ISC