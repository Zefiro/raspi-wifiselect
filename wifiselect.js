#!/usr/bin/node

var Q = require('q')
var fs = require('fs')
var path = require('path')
var request = require('request')
var execP = require('child-process-promise').exec
var exec = require('child_process').exec

var igorUrl = "http://igor.cave.zefiro.de/raspi/wlan.php"
var usbBasePath = "/media/auto/usbstick/raspi/"
var filePath = usbBasePath + "wifi.txt"
var wfcBasePath = "/media/auto/usbstick/SMRTNTKY/"
var wfcFilePath = wfcBasePath + "WSETTING.WFC"
var wpaConfigPath = "/etc/wpa_supplicant/wpa_supplicant.conf"

var self = {
    parseScan: function (txt) {
        return txt.split("\n")
	},
	scan_wifi: function() {
		// http://stackoverflow.com/questions/5775088/is-it-possible-to-execute-an-external-program-from-within-node-js
		// exec has limitations (buffer size 512kb), if it stops to work, use spawn instead
		console.log("Retrieving list of WIFI networks")
		deferred = Q.defer()
		exec('iwlist scan 2>/dev/null | awk -F\'"\' \'/ESSID/{print $2}\'', function callback(error, stdout, stderr){
			if (!error) {
				networks = self.parseScan(stdout)
				details = []
				for(i = 0; i < networks.length; i++) {
					network = networks[i]
					if (network != "") {
						details.push('ssid="' + networks[i] + '" psk=""')
					}
				}
				console.log("Found networks: " + networks)
				deferred.resolve({'list': networks, 'details': details})
			} else {
				console.log(stdout)
				console.log(stderr)
				deferred.reject(error)
			}
		})
		return deferred.promise
	},
	encryptPassword: function(ssid, passphrase) {
		// TODO possible shell injection, parameters should be sanitized (don't know how)
		console.log("Running /usr/bin/wpa_passphrase " + ssid + " " + passphrase)
		p = execP("/usr/bin/wpa_passphrase " + ssid + " " + passphrase)
		return p
	},
	check_igor: function() {
		console.log("Checking with Igor at " + igorUrl)

	    data = { "networks" : networks }
		request.post(igorUrl,
			{ "form": { "data": encodeURIComponent(JSON.stringify(data)) } },
			function (error, response, body) {
				if (!error && response.statusCode == 200) {
					console.log(body)
					var jsonresponse = JSON.parse(body)
					console.log("Got response: " + jsonresponse.preferredSSID )
				} else {
					console.log("Got error (code: "+response.statusCode+"): ", e)
				}
			}
		)
	},
	writeFile: function(filename, content) {
		return function() {
			p=Q.nfcall(fs.writeFile, filename, content, {encoding: 'utf-8'})
			p=p.fail(self.fail("Error while trying to write to file " + filename))
			return p
		}
	},
	addWpaPassword: function(ssid, password) {
		p=Q()
		p=p.then(function() {
			console.log("Reading " + wpaConfigPath)
			p=Q.nfcall(fs.readFile, wpaConfigPath, {encoding: 'utf-8'})
			p=p.fail(self.fail("Error while trying to open file " + wpaConfigPath))
			p=p.then(function(content) {
				data.wpaconfig = content
			})
			return p
		})
		p=p.then(function() {
			p=self.encryptPassword(ssid, password)
			p=p.fail(self.fail("Error while encrypting password"))
			p=p.then(function(content) {
				var wpacfg = content.stdout
				wpacfg.trim()
				if (res = wpacfg.match(/^([\s\S]*)}([\s\S]*$)/m)) {
				    wpacfg = res[1] + "\tpriority=5\n}" + res[2]
				} else {
				    // ups? format not as expected - silently ignore
				    console.log("Fuck... no match")
				}
				data.newNetworkConfig = wpacfg
			})
			return p
		})
		p=p.then(function() {
			console.log("Adapting config")
			// modify data.wpaconfig to include data.netNetworkConfig, if it's valid and not already present
			// split into network blocks (if present, first chunk is the global configuration)
			cfg = data.wpaconfig
			cfgChunks = []
			while ((idx = cfg.substring(1).search(/network\s*=\s*{/)+1) != 0) {
					cfgChunks.push(cfg.substring(0, idx))
				cfg = cfg.substring(idx)
			}
			cfgChunks.push(cfg)
			// filter out the network to be added, if it already exists
			for(i = cfgChunks.length-1; i >= 0; i--) {
				if (cfgChunks[i].match('ssid\\s*=\\s*"'+ssid+'"')) {
					console.log("Overwriting previous entry")
					cfgChunks.splice(i, 1)
				}
			}
			// add as first network, but after global configuration if it exists
			addIdx = cfgChunks[0].match("/network\s*=\s*{/") != -1 ? 1 : 0
			cfgChunks.splice(addIdx, 0, data.newNetworkConfig)
			data.wpaconfig = cfgChunks.join("")
// console.log(data.wpaconfig)
		})
		p=p.then(function() {
			console.log("Writing wifi config file " + wpaConfigPath)
			p=p.then(self.writeFile(wpaConfigPath, data.wpaconfig))
			p=p.fail(self.fail("Error while writing Wifi config file " + wpaConfigPath))
			return p
		})
		p=p.then(function() {
			console.log("Restarting wpa_cli")
			p=execP("/sbin/wpa_cli reconfigure")
			p=p.fail(self.fail("Error while reloading wpa_cli"))
			return p
		})
		return p
	},
	usb_wifitxt: function() {
		data = {}
		p=Q("start")
		p=p.then(function() {
			console.log("Reading " + filePath)
			p = Q.nfcall(fs.readFile, filePath, {encoding: 'utf-8'})
			p=p.fail(self.fail("Error while trying to open file " + filePath))
			p=p.then(function(content) {
				data.cmdFile = content
			})
			return p
		})
		p=p.then(function() {
			p=self.scan_wifi()
			p=p.fail(self.fail("Error while scanning WIFI"))
		    p=p.then(function(content) {
				data.networks = content
			})
			return p
		})
		p=p.then(function() {
			console.log("Parsing command file")
			// note: this form of split() will include the actual linebreaks in the commands array, but we ignore them further down
			commands = data.cmdFile.split(/(\n|\r\n|\r)/)
			p = Q()
			for(i = 0; i < commands.length; i++) {
				command = commands[i].trim()
				if (command == "scan") {
					console.log("Writing current networks to file " + filePath)
					p=p.then(self.writeFile(filePath, "scan\n" + data.networks.details.join("\n")))
					p=p.fail(self.fail("Error while writing Wifi scan result"))
				}
				if (res = command.match(/ssid="([^"]*)".*psk="([^"]*)"/)) {
					if (res[2] != "") { // password given?
					    var idx = data.networks.list.indexOf(res[1])
						if (idx != -1) { // network currently visible?
							data.selectedNetwork = data.networks.list[idx] // security: don't use user-supplied value
							data.selectedPassword = res[2] // ...well, there is no good way to validate WIFI passwords
						} else {
							self.fail('Error: ssid="' + res[1] + '" not reachable')(data.networks.list)
						}
					}
				}
			}
			console.log("Finished parsing command file")
			if (data.selectedNetwork && data.selectedPassword) {
				p=p.then(function() {
					return self.addWpaPassword(data.selectedNetwork, data.selectedPassword)
				})
			}
			return p
		})
		return p
	},
	usb_wfc: function() {
		data = {}
		p=Q("start")
		p=p.then(function() {
			console.log("Reading " + wfcFilePath)
			p = Q.nfcall(fs.readFile, wfcFilePath, {encoding: 'utf-8'})
			p=p.fail(self.fail("Error while trying to open file " + wfcFilePath))
			p=p.then(function(content) {
				data.wfcxml = content
			})
			return p
		})
		p=p.then(function() {
		    console.log("Parsing WFC file")
            var parseString = require('xml2js').parseString
            p = Q.nfcall(parseString, data.wfcxml)
            p=p.then(function(content) {
                console.log(JSON.stringify(content, null, 4));
                // I hope the XML structure is standardized and doesn't change...
                data.selectedNetwork = content.wirelessProfile.ssid[0]._
                data.selectedPassword = content.wirelessProfile.primaryProfile[0].networkKey[0]._
                console.log("Parsing got SSID='" + data.selectedNetwork + "' with password='" + data.selectedPassword + "'")
            })
            return p
		})
		p=p.then(function() {
			p=self.scan_wifi()
			p=p.fail(self.fail("Error while scanning WIFI"))
		    p=p.then(function(content) {
				data.networks = content
			})
			return p
		})
		p=p.then(function() {
			return self.addWpaPassword(data.selectedNetwork, data.selectedPassword)
		})
		return p
	},
	/** returns a function useable in promise.fail() which prints the given message, the error and then exits the program */
	fail: function(msg) {
		return function(error) {
			console.log(msg)
			console.log(error)
			PROGRAM_IS_TERMINATED = true
			throw error
		}
	},
	/** Gracefully exits the program */
	exit: function() {
		console.log("Wifiselect finished.")
		PROGRAM_IS_TERMINATED = true
	}
}

var PROGRAM_IS_TERMINATED = false

var args = process.argv.slice(2)
switch((args[0]+"").toLowerCase()) {
    case "usb2":
        self.usb_wifitxt().done(self.exit, self.fail("ABORTED"))
        break
    case "wfc":
        self.usb_wfc().done(self.exit, self.fail("ABORTED"))
        break
    default:
        console.log(args[0] ? "Unrecognized argument: " + args[0] : "No argument given")
        console.log("Valid arguments are:")
        console.log("  USB: reads '" + usbBasePath + "'")
        console.log("  WFC: reads '" + wfcFilePath + "'")
        PROGRAM_IS_TERMINATED = true
}

// all action happens in async callbacks, so we just need to ensure Node keeps running
(function wait () {
   if (!PROGRAM_IS_TERMINATED) setTimeout(wait, 10)
})()

