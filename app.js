var express = require('express');
var ejs = require('ejs');
var bodyParser = require('body-parser');
var socketIo = require('socket.io');
var serialport = require('serialport');
var Readline = require('@serialport/parser-readline');
var mqtt = require('mqtt');

var path = require('path');

var port = 5000
var serialPorts = [];
serialport.list().then(ports => {
	ports.forEach(function (port) {
		serialPorts.push(port.path);
	});
});

var topic = 'v1/devices/me/telemetry';
var option = {
	host: '127.0.0.1',
	port: 8883,
	username: 'illumacc02',
}
var mqttClient = mqtt.connect(option);
mqttClient.on('connect', () => {
	console.log('MQTT Client connected');
});
mqttClient.on('error', (error) => {
	console.log('MQTT Client connect failed');
});

var app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended:false}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'node_modules')));

app.get('/', function(req, res) {
	res.render('index.ejs', {portList : serialPorts});
});

var server = app.listen(port, function(){
	console.log('Start server on port 5000...');
});

var io = socketIo(server);
var ports = [[],[]];
var portObjects = [];
var count = 0;
io.on('connect', function(socket){
	console.log('Client Connect');
	socket.on('disconnect', function(){
		console.log('Client Diasconnect');
	});
	socket.on('portName', function(data) {
		var index = ports[0].indexOf(data.portName);
		if(index >= 0){
			console.log('Already Existed Port');
		}else{
			// new port request
			ports[0][count] = data.portName;
			ports[1][count++] = 0;
			console.log(ports);
			init_sensor(data.portName, socket);
		}
	});
	socket.on('closePort', function(data){
		var portName = data.portName;
		for(var i=0; i<portObjects.length; i++){
			if(portObjects[i].path == portName){
				console.log('close port');
				portObjects[i].close();
				portObjects.splice(i, 1);
				var num = ports[0].indexOf(portName);
				ports[0].splice(num, 1);
				ports[1].splice(num, 1);
				console.log('delete fin');
				console.log(ports);
				count--;
			}
		}
	});
});

function init_sensor(port_name, socket) {
	var myPort = new serialport(port_name);
	portObjects.push(myPort);
	var portParser = myPort.pipe(new Readline({ delimiter: '\r\n' }));
	portParser.on('data', function(data){
		var num = ports[0].indexOf(port_name);
		ports[1][num] = data;
		console.log(ports);
		// - sending data to socket clients
		socket.emit('data', {portInfo:port_name + ':' + data});
		// - publishing mqtt message -
		var msg = {[port_name]:data};
		mqttClient.publish(topic, JSON.stringify(msg));
	});
	portParser.on('close', showPortClose);
	portParser.on('error', showError);
	if(portParser) {
		console.log('Sensor Port Initialized');
	}
}
function showPortClose() {
	console.log('Port Closed.');
}
function showError(error) {
	var error_str = util.format("%s", error);
	console.log(error.message);
	if (error_str.substring(0, 14) == "Error: Opening") {
		console.log('Error : Opening')
	}
	else {
		console.log('SerialPort port error : ' + error);
	}
}
