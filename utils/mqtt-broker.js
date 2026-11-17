// Dev MQTT broker for the bulb project — stands in for Mosquitto until the
// Pi/PC hub exists. One aedes instance serves both transports:
//   TCP 1883      -> firmware/bulb/mqtt.py (MicroPython umqtt, plain TCP)
//   WS  9001      -> app/web (browser MQTT.js can only do WebSocket)
//
//   cd tools && npm install && node mqtt-broker.js

const aedes = require('aedes')();
const net = require('net');
const { WebSocketServer } = require('ws');
const websocketStream = require('websocket-stream');

let msgs = 0;
aedes.on('publish', (pkt) => {
  msgs++;
  if (msgs <= 50 || msgs % 100 === 0) {
    console.log(`[pub] ${pkt.topic} (${pkt.payload.length}B${pkt.retain ? ', retain' : ''})`);
  }
});

net.createServer(aedes.handle).listen(1883, () => {
  console.log('MQTT TCP listening on :1883 (firmware)');
});

const wss = new WebSocketServer({ port: 9001 });
wss.on('connection', (socket) => {
  console.log('MQTT WS client connected');
  aedes.handle(websocketStream(socket));
});
console.log('MQTT WS  listening on :9001 (web app)');
