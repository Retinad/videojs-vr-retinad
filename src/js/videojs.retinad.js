(function(vjs, AWS) {

    /**
     *
     *  Base64 encode / decode
     *  http://www.webtoolkit.info/
     *
     **/
    var Base64 = {

// private property
        _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

// public method for encoding
        encode : function (input) {
            var output = "";
            var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
            var i = 0;

            input = Base64._utf8_encode(input);

            while (i < input.length) {

                chr1 = input.charCodeAt(i++);
                chr2 = input.charCodeAt(i++);
                chr3 = input.charCodeAt(i++);

                enc1 = chr1 >> 2;
                enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
                enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
                enc4 = chr3 & 63;

                if (isNaN(chr2)) {
                    enc3 = enc4 = 64;
                } else if (isNaN(chr3)) {
                    enc4 = 64;
                }

                output = output +
                    this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +
                    this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);

            }

            return output;
        },

// public method for decoding
        decode : function (input) {
            var output = "";
            var chr1, chr2, chr3;
            var enc1, enc2, enc3, enc4;
            var i = 0;

            input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

            while (i < input.length) {

                enc1 = this._keyStr.indexOf(input.charAt(i++));
                enc2 = this._keyStr.indexOf(input.charAt(i++));
                enc3 = this._keyStr.indexOf(input.charAt(i++));
                enc4 = this._keyStr.indexOf(input.charAt(i++));

                chr1 = (enc1 << 2) | (enc2 >> 4);
                chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
                chr3 = ((enc3 & 3) << 6) | enc4;

                output = output + String.fromCharCode(chr1);

                if (enc3 != 64) {
                    output = output + String.fromCharCode(chr2);
                }
                if (enc4 != 64) {
                    output = output + String.fromCharCode(chr3);
                }

            }

            output = Base64._utf8_decode(output);

            return output;

        },

// private method for UTF-8 encoding
        _utf8_encode : function (string) {
            string = string.replace(/\r\n/g,"\n");
            var utftext = "";

            for (var n = 0; n < string.length; n++) {

                var c = string.charCodeAt(n);

                if (c < 128) {
                    utftext += String.fromCharCode(c);
                }
                else if((c > 127) && (c < 2048)) {
                    utftext += String.fromCharCode((c >> 6) | 192);
                    utftext += String.fromCharCode((c & 63) | 128);
                }
                else {
                    utftext += String.fromCharCode((c >> 12) | 224);
                    utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                    utftext += String.fromCharCode((c & 63) | 128);
                }

            }

            return utftext;
        },

// private method for UTF-8 decoding
        _utf8_decode : function (utftext) {
            var string = "";
            var i = 0;
            var c = c1 = c2 = 0;

            while ( i < utftext.length ) {

                c = utftext.charCodeAt(i);

                if (c < 128) {
                    string += String.fromCharCode(c);
                    i++;
                }
                else if((c > 191) && (c < 224)) {
                    c2 = utftext.charCodeAt(i+1);
                    string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
                    i += 2;
                }
                else {
                    c2 = utftext.charCodeAt(i+1);
                    c3 = utftext.charCodeAt(i+2);
                    string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
                    i += 3;
                }

            }

            return string;
        }

    }

    /**
     * Copies properties from one or more objects onto an original.
     */
    var extend = function(obj /*, arg1, arg2, ... */) {
        var arg, i, k;
        for (i = 1; i < arguments.length; i++) {
            arg = arguments[i];
            for (k in arg) {
                if (arg.hasOwnProperty(k)) {
                    obj[k] = arg[k];
                }
            }
        }
        return obj;
    };

    var santitizeBase64 = function (base64) {
        // '+' to '-'
        // '/' to '_'
        // '=' to '.'
        return base64.replace('+','-').replace('/','_').replace('=','.');
    };

    // Function to round to the nearest specified decimal
    Number.prototype.round = function(places) {
        return +(Math.round(this + "e+" + places)  + "e-" + places);
    }

    // Assume that forward vector is U=0.5 V=0.5 and right vector U=1 V=0.5, Up is V=1
    var convertVector3ToUV = function(vector){
        var u, v;
        // Check if y value is near 1 or -1 and force the value as it will generate an NaN from asin
        if (vector.y.round(5) == 1) {
            v = 1.0;
        }
        else if (vector.y.round(5) == -1) {
            v = 0.0;
        }
        else {
            v =  (Math.asin(vector.y) / Math.PI) + 0.5;
        }
        u =  0.5 + (Math.atan2(vector.x, -vector.z) / (2*Math.PI));
        return {
            u: u,
            v: v
        }
    };

    var defaults = {
        appId:'',
        accountKey:''
    };

    var plugin = function(options){
      if(!!navigator.doNotTrack)
        return;

        var player = this,
            settings = extend({}, defaults, options || {}),
            partitionKey = (Math.random() + 1).toString(36).substring(7), // The partition key for kinesis, need to be random for proper shard load balancing
            session = null, // The session id, will be retrieve by the call to the Retinad REST API
            context = santitizeBase64(Base64.encode(player.currentSrc()+" "+ options.appId)), // The context hash, corresponds to the video name + appId
            timer = null;

        // Initialize Kinesis
        //   Please note that other regions can be added in the future, but this one should be always available.
        //   Those values are fixed and should not be changed.
        var kinesis = new AWS.Kinesis({region: 'us-west-2',
            accessKeyId: 'AKIAJCTJLO56FB4NBOQQ',
            secretAccessKey: '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',
            apiVersion: '2013-12-02'});

        var playString = 'start';

        //initialise the vr plugin
        if(!player.vr){
            throw 'videojs.vr plugin is required.'
        }

        //init the vr plugin
        player.vr({projection: "360"});

        // Declare the sendData function which send through Kinesis
        function sendData(data) {

            var params = {
                Data: JSON.stringify(data), // The json data that we want to send to Retinad servers
                PartitionKey: partitionKey, // Random string for better shared distribution
                StreamName: 'rawUncompressed', // Uses the uncompressed method for now, until we implement the Retinad compression algorithm
            };

            kinesis.putRecord(params, function(err, result) {
                if (err) {
                    console.error(err, err.stack); // an error occurred
                }
            });
        }

        // The array that will content frames
        var frames = []; // The array buffer

        // The collect data function. Called ten times per second. Please note that it use fake data for now.
        function collectData(forcePush) {

            var currentUV = convertVector3ToUV(player.vr.cameraVector);
            // The number of frame is incremented for each 10th (tenth) of a second (0.1 second), rounded to the nearest integer
            //   So for a time of 1.29 second, it'll be 13 and for a time of 10.53 seconds, it'll be 105

            var frameNumber = Math.round((player.currentTime()*1000)/100);

            context = santitizeBase64(Base64.encode(player.currentSrc()+" "+ options.appId));

            // Add a frame to the frames array
            frames.push({
                "f": frameNumber,
                "u": currentUV.u,
                "v": currentUV.v
            });
            // If we have 5 seconds of data, we send it to our servers (this will batch the frames together to reduce network load and bandwidth)
            if (frames.length >= 50 || forcePush) {

                // We create a deep copy of the array
                var clonedFrames = JSON.parse(JSON.stringify(frames));

                // We delete the frames array (to put new data in it)
                frames = [];

                // We create the event with the copied data
                var event = {
                    a: settings.appId, // The appId from Retinad dashboard
                    s: session, // The session id retreived from the first call to the Retinad REST API
                    e: [
                        {
                            t: 'uv', // The type of the event
                            c: context, // The context hash
                            f: clonedFrames // Frames to be send
                        }
                    ]
                };
                sendData(event); // This function is declared above
            }
        }

        var webglInfo =
        {
            "version" : "not found",
            "vendor" : "not found",
            "renderer" : "not found",
            "unmaskedVendor" : "not found",
            "unmaskedRenderer" : "not found"
        };

        //Look for WebGL information
        if (!!window.WebGLRenderingContext) {
          var canvas = document.createElement("canvas"),
          names = ["webgl", "experimental-webgl", "moz-webgl", "webkit-3d"],
          canvasContext = false;
          for (var i=0;i<4;i++) {
            try {
                canvasContext = canvas.getcanvasContext(names[i]);
                if (canvasContext && typeof canvasContext.getParameter == "function") {
                    // WebGL is enabled
                    if (webglInfo.version === "not found")
                      webglInfo.version = canvasContext.getParameter(canvasContext.VERSION);
                    if (webglInfo.vendor === "not found")
                      webglInfo.vendor = canvasContext.getParameter(canvasContext.VENDOR);
                    if (webglInfo.renderer === "not found")
                      webglInfo.renderer = canvasContext.getParameter(canvasContext.RENDERER);

                    var debugInfo = canvasContext.getExtension('WEBGL_debug_renderer_info');
                    if (webglInfo.unmaskedVendor === "not found")
                      webglInfo.unmaskedVendor = canvasContext.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                    if (webglInfo.unmaskedRenderer === "not found")
                      webglInfo.unmaskedRenderer = canvasContext.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                }
            } catch(e) {}
          }
        }

        // Create a new ClientJS object
        var client = new ClientJS();

        var request = new XMLHttpRequest();
        request.open('POST', 'https://api.retinad.io/analytics/sessions', true);
        request.setRequestHeader('Content-Type', 'application/json');
        request.setRequestHeader('Retinad-Api-Key','#|:J$#]$7|54"?4>(|Ux91<]]{wTDi');
        request.setRequestHeader('Retinad-Account-Key',settings.accountKey);
        request.onreadystatechange = function() {
          if (request.readyState == XMLHttpRequest.DONE ) {
             if (request.status == 200) {
               //Success
               JSON.parse(request.responseText, (key, value) =>{
                 if (key == "s")
                    session = value;
                  });

                 // If the get session call works, start a timer and poll data every tenth of a second.
                 player.on('play',function(){
                     var event = {
                         a: settings.appId, // The appId from Retinad dashboard
                         s: session, // The session id retreived from the first call to the Retinad REST API
                         e: [
                             {
                                 t: 'state', // The type of the event
                                 n: playString, // The value of the state
                                 d:  (new Date()).toISOString() // Current time
                             }
                         ]
                     };
                     sendData(event);
                     if (playString === 'start')
                        playString = 'resume';

                     timer = setInterval(function() {
                         collectData(); // This function is implemented above
                     }, 100); // Tenth of a second (100 milliseconds)
                 });
                 player.on('pause',function(){
                     var event = {
                         a: settings.appId, // The appId from Retinad dashboard
                         s: session, // The session id retreived from the first call to the Retinad REST API
                         e: [
                             {
                                 t: 'state', // The type of the event
                                 n: 'pause', // The value of the state
                                 d:  (new Date()).toISOString() // Current time
                             }
                         ]
                     };
                     sendData(event);

                     clearInterval(timer);
                     collectData(true);
                 });
             } else {
                console.error('Retinad session creation failed. Error ' + request.status + ' : ' + request.responseText);
             }
          }
        };
        request.send(JSON.stringify({
                "a" : settings.appId, // The appId from Retinad dashboard
                "d" : {
                    "retinad" : {
                        "name" : "videojs-vr-retinad",
                        "version" : "1.0.0"
                    },
                    "user" : {
                        "fingerprint" : client.getFingerprint().toString()
                    },
                    "browser" : {
                        "name" : client.getBrowser(),
                        "version" : client.getBrowserVersion(),
                        "userAgent" : client.getUserAgent(),
                        "engine" : {
                            "name" : client.getEngine(),
                            "version" : client.getEngineVersion()
                        }
                    },
                    "os" : {
                        "name" : client.getOS(),
                        "version" : client.getOSVersion(),
                        "timeZone" : client.getTimeZone(),
                        "language" : client.getLanguage(),
                        "systemLanguage" : client.getSystemLanguage()
                    },
                    "device" : {
                        "name" : client.getDevice(),
                        "type" : client.getDeviceType(),
                        "vendor" : client.getDeviceVendor(),
                        "mobile" : client.isMobile()
                    },
                    "cpu" : {
                        "name" : client.getCPU()
                    },
                    "screen" : {
                        "print" : client.getScreenPrint(),
                        "colorDepth" : client.getColorDepth(),
                        "currentResolution" : client.getCurrentResolution(),
                        "availableResolution" : client.getAvailableResolution(),
                        "XDPI" : client.getDeviceXDPI(),
                        "YDPI" : client.getDeviceYDPI()
                    },
                    "plugin" : {
                        "list" : client.getPlugins()
                    },
                    "webgl" : webglInfo
                }
            }));

        window.onbeforeunload = function(e) {
            collectData(true);
            var event = {
                a: settings.appId, // The appId from Retinad dashboard
                s: session, // The session id retreived from the first call to the Retinad REST API
                e: [
                    {
                        t: 'state', // The type of the event
                        n: 'end', // The value of the state
                        d:  (new Date()).toISOString() // Current time
                    }
                ]
            };
            sendData(event);
        };
    };

    videojs.plugin('retinad', plugin);
})(window.videojs, window.AWS);
