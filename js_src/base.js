/**
* Base Module
* ===========
*
* This module contains common classes and functions which are used throughout the rest of the js2p library.
*/

"use strict";

var buffer = require('buffer');  // These ensure parser compatability with browserify
var Buffer = buffer.Buffer;
var BigInt = require('big-integer');
var SHA = require('jssha');
var zlib = require('zlibjs');
var assert = require('assert');
var net = require('net');
var util = require('util');

/**
* .. note::
*
*     This library will likely issue a warning over the size of data that :js:class:`Buffer` can hold. On most implementations
*     of Javascript this is 2GiB, but the maximum size message that can be transmitted in our serialization scheme is 4GiB.
*     This shouldn't be a problem for most applications, but you can discuss it in :issue:`83`.
*/
if (buffer.kMaxLength < 4294967299) {
    console.log(`WARNING: This implementation of javascript does not support the maximum protocol length. The largest message you may receive is 4294967299 bytes, but you can only allocate ${buffer.kMaxLength}, or ${(buffer.kMaxLength / 4294967299 * 100).toFixed(2)}% of that.`);
}

var base;

if( typeof exports !== 'undefined' ) {
    if( typeof module !== 'undefined' && module.exports ) {
        base = exports = module.exports;
    }
    base = exports;
}
else {
    root.base = {};
    base = root;
}

/**
* .. js:data:: js2p.base.version_info
*
*     A list containing the version numbers in the format ``[major, minor, patch]``.
*
*     The first two numbers refer specifically to the protocol version. The last number increments with each build.
*
* .. js:data:: js2p.base.node_policy_version
*
*     This is the last number in :js:data:`~js2p.base.version_info`
*
* .. js:data:: js2p.base.protocol_version
*
*     This is the first two numbers of :js:data:`~js2p.base.version_info` joined in the format ``'a.b'``
*
*     .. warning::
*
*         Nodes with different versions of this variable will actively reject connections with each other
*
* .. js:data:: js2p.base.version
*
*     This is :js:data:`~js2p.base.version_info` joined in the format ``'a.b.c'``
*/

base.version_info = [0, 5, 551];
base.node_policy_version = base.version_info[2].toString();
base.protocol_version = base.version_info.slice(0, 2).join(".");
base.version = base.version_info.join('.');

base.flags = {
    /**
    * .. js:data:: js2p.base.flags
    *
    *     A "namespace" which defines protocol reserved flags
    */
    reserved: ['\x00', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07',
               '\x08', '\x09', '\x0A', '\x0B', '\x0C', '\x0D', '\x0E', '\x0F',
               '\x10', '\x11', '\x12', '\x13', '\x14', '\x15', '\x16', '\x17',
               '\x18', '\x19', '\x1A', '\x1B', '\x1C', '\x1D', '\x1E', '\x1F'],

    //main flags
    broadcast:   '\x00',
    renegotiate: '\x01',
    whisper:     '\x02',
    ping:        '\x03',
    pong:        '\x04',

    //sub-flags
    //broadcast: '\x00',
    compression: '\x01',
    //whisper:   '\x02',
    //ping:      '\x03',
    //pong:      '\x04',
    handshake:   '\x05',
    notify:      '\x06',
    peers:       '\x07',
    request:     '\x08',
    resend:      '\x09',
    response:    '\x0A',
    store:       '\x0B',
    retrieve:    '\x0C',

    //compression methods
    bz2:      '\x10',
    gzip:     '\x11',
    lzma:     '\x12',
    zlib:     '\x13',
    bwtc:     '\x14',
    context1: '\x15',
    defsum:   '\x16',
    dmc:      '\x17',
    fenwick:  '\x18',
    huffman:  '\x19',
    lzjb:     '\x1A',
    lzjbr:    '\x1B',
    lzp3:     '\x1C',
    mtf:      '\x1D',
    ppmd:     '\x1E',
    simple:   '\x1F'
};

base.compression = [base.flags.zlib, base.flags.gzip];
base.json_compressions = JSON.stringify(base.compression);

// User salt generation pulled from: http://stackoverflow.com/a/2117523
base.user_salt = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0;
    var v = c === 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
});

base.intersect = function intersect()    {
    /**
    * .. js:function:: js2p.base.intersect(array1, array2, [array3, [...]])
    *
    *     This function returns the intersection of two or more arrays.
    *     That is, it returns an array of the elements present in all arrays,
    *     in the order that they were present in the first array.
    *
    *     :param arrayn: Any array-like object
    *
    *     :returns: An array
    */
    var last = arguments.length - 1;
    var seen={};
    var result=[];
    for (var i = 1; i <= last; i++)   {
        for (var j = 0; j < arguments[i].length; j++)  {
            if (seen[arguments[i][j]])  {
                seen[arguments[i][j]] += 1;
            }
            else if (i === 1)    {
                seen[arguments[i][j]] = 1;
            }
        }
    }
    for (var i = 0; i < arguments[0].length; i++) {
        if ( seen[arguments[0][i]] === last)
            result.push(arguments[0][i]);
        }
    return result;
}

base.unpack_value = function unpack_value(str)  {
    /**
    * .. js:function:: js2p.base.unpack_value(str)
    *
    *     This function unpacks a string into its corresponding big endian value
    *
    *     :param str: The string you want to unpack
    *
    *     :returns: A big-integer
    */
    str = new Buffer(str, 'ascii');
    var val = BigInt.zero;
    for (var i = 0; i < str.length; i++)    {
        val = val.shiftLeft(8);
        val = val.add(str[i]);
    }
    return val;
}

base.pack_value = function pack_value(len, i) {
    /**
    * .. js:function:: js2p.base.pack_value(len, i)
    *
    *     This function packs an integer i into a buffer of length len
    *
    *     :param len:   An integral value
    *     :param i:     An integeral value
    *
    *     :returns: A big endian buffer of length len
    */
    var arr = new Buffer(new Array(len));
    for (var j = 0; j < len && i != 0; j++)    {
        arr[len - j - 1] = i & 0xff;
        i = i >> 8;
    }
    return arr;
}

base.base_58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

base.to_base_58 = function to_base_58(i) {
    /**
    * .. js:function:: js2p.base.to_base_58(i)
    *
    *     Takes an integer and returns its corresponding base_58 string
    *
    *     :param i: An integral value
    *
    *     :returns: the corresponding base_58 string
    */
    var string = "";
    if (!BigInt.isInstance(i)) {
        i = new BigInt(i);
    }
    while (i.notEquals(0)) {
        string = base.base_58[i.mod(58)] + string;
        i = i.divide(58);
    }
    if (!string)    {
        string = "1";
    }
    return string;
};


base.from_base_58 = function from_base_58(string) {
    /**
    * .. js:function:: js2p.base.from_base_58(string)
    *
    *     Takes a base_58 string and returns its corresponding integer
    *
    *     :param string: A base_58 string or string-like object
    *
    *     :returns: A big-integer
    */
    try {
        string = string.toString()
    }
    finally {
        var decimal = new BigInt(0);
        //for char in string {
        for (var i = 0; i < string.length; i++) {
            decimal = decimal.times(58).plus(base.base_58.indexOf(string[i]));
        }
        return decimal;
    }
};


base.getUTC = function getUTC() {
    /**
    * .. js:function:: js2p.base.getUTC()
    *
    *     :returns: An integral value containing the unix timestamp in seconds UTC
    */
    return Math.floor(Date.now() / 1000);
};


base.SHA384 = function SHA384(text) {
    /**
    * .. js:function:: js2p.base.SHA384(text)
    *
    *     This function returns the hex digest of the SHA384 hash of the input text
    *
    *     :param string text: A string you wish to hash
    *
    *     :returns: the hex SHA384 hash
    */
    var hash = new SHA("SHA-384", "TEXT");
    hash.update(text);
    return hash.getHash("HEX");
};


base.SHA256 = function SHA256(text) {
    /**
    * .. js:function:: js2p.base.SHA256(text)
    *
    *     This function returns the hex digest of the SHA256 hash of the input text
    *
    *     :param string text: A string you wish to hash
    *
    *     :returns: the hex SHA256 hash
    */
    var hash = new SHA("SHA-256", "TEXT");
    hash.update(text);
    return hash.getHash("HEX");
};


base.compress = function compress(text, method) {
    /**
    * .. js:function:: js2p.base.compress(text, method)
    *
    *     This function is a shortcut for compressing data using a predefined method
    *
    *     :param text:      The string or Buffer-like object you wish to compress
    *     :param method:    A compression method as defined in :js:data:`~js2p.base.flags`
    *
    *     :returns: A variabley typed object containing a compressed version of text
    */
    if (method === base.flags.zlib) {
        return zlib.deflateSync(new Buffer(text));
    }
    else if (method === base.flags.gzip) {
        return zlib.gzipSync(new Buffer(text));
    }
    else {
        throw new Error("Unknown compression method");
    }
};


base.decompress = function decompress(text, method) {
    /**
    * .. js:function:: js2p.base.decompress(text, method)
    *
    *     This function is a shortcut for decompressing data using a predefined method
    *
    *     :param text:      The string or Buffer-like object you wish to decompress
    *     :param method:    A compression method as defined in :js:data:`~js2p.base.flags`
    *
    *     :returns: A variabley typed object containing a decompressed version of text
    */
    if (method === base.flags.zlib) {
        return zlib.inflateSync(new Buffer(text));
    }
    else if (method === base.flags.gzip) {
        return zlib.gunzipSync(new Buffer(text));
    }
    else {
        throw new Error("Unknown compression method");
    }
};


base.protocol = class protocol {
    /**
    * .. js:class:: js2p.base.protocol(subnet, encryption)
    *
    *     This class is used as a subnet object. Its role is to reject undesired connections.
    *     If you connect to someone who has a different protocol object than you, this descrepency is detected,
    *     and you are silently disconnected.
    *
    *     :param string subnet:     The subnet ID you wish to connect to. Ex: ``'mesh'``
    *     :param string encryption: The encryption method you wish to use. Ex: ``'Plaintext'``
    */
    constructor(subnet, encryption) {
        this.subnet = subnet;
        this.encryption = encryption;
    }

    get id() {
        /**
        *     .. js:attribute:: js2p.base.protocol.id
        *
        *         The ID of your desired network
        */
        var protocol_hash = base.SHA256([this.subnet, this.encryption, base.protocol_version].join(''));
        return base.to_base_58(new BigInt(protocol_hash, 16));
    }
};

base.default_protocol = new base.protocol('', 'Plaintext');

base.InternalMessage = class InternalMessage {
    /**
    * .. js:class:: js2p.base.InternalMessage(msg_type, sender, payload, compression, timestamp)
    *
    *     This is the message serialization/deserialization class.
    *
    *     :param msg_type:          This is the main flag checked by nodes, used for routing information
    *     :param sender:            The ID of the person sending the message
    *     :param payload:           A list of "packets" that you want your peers to receive
    *     :param compression:       A list of compression methods that the receiver supports
    *     :param number timestamp:  The time at which this message will be sent in seconds UTC
    */
    constructor(msg_type, sender, payload, compression, timestamp) {
        this.msg_type = new Buffer(msg_type);
        this.sender = new Buffer(sender);
        this.payload = payload || [];
        for (var i = 0; i < this.payload.length; i++)   {
            this.payload[i] = new Buffer(this.payload[i]);
        }
        this.time = timestamp || base.getUTC();
        this.compression = compression || [];
        this.compression_fail = false
    }

    static feed_string(string, sizeless, compressions) {
        /**
        *     .. js:function:: js2p.base.InternalMessage.feed_string(string, sizeless, compressions)
        *
        *         This method deserializes a message
        *
        *         :param string:        The message you would like to deserialize
        *         :param sizeless:      A bool-like object describing whether the size header is present
        *         :param compressions:  A list of possible compression methods this message may be under
        *
        *         :returns: A :js:class:`~js2p.base.InternalMessage` object containing the deserialized message
        */
        string = base.InternalMessage.sanitize_string(string, sizeless)
        var compression_return = base.InternalMessage.decompress_string(string, compressions)
        var compression_fail = compression_return[1]
        string = compression_return[0]
        var packets = base.InternalMessage.process_string(string)
        var msg = new base.InternalMessage(packets[0], packets[1], packets.slice(4), compressions)
        msg.time = base.from_base_58(packets[3])
        msg.compression_fail = compression_fail
        assert (msg.id === packets[2].toString(), `ID check failed. ${msg.id} !== ${packets[2].toString()}`)
        return msg
    }

    static sanitize_string(string, sizeless) {
        try {
            string = new Buffer(string)
        }
        finally {
            if (!sizeless) {
                if (base.unpack_value(string.slice(0,4)) + 4 !== string.length) {
                    //console.log(`slice given: ${string.slice(0, 4).inspect()}.  Value expected: ${string.length - 4}.  Value derived: ${base.unpack_value(string.slice(0, 4))}`)
                    throw "The following expression must be true: unpack_value(string.slice(0,4)) === string.length - 4"
                }
                string = string.slice(4)
            }
            return string
        }
    }

    static decompress_string(string, compressions) {
        var compression_fail = false
        compressions = compressions || []
        for (var i = 0; i < compressions.length; i++) {
            //console.log(`Checking ${compressions[i]} compression`)
            if (base.compression.indexOf(compressions[i]) > -1) {  // module scope compression
                //console.log(`Trying ${compressions[i]} compression`)
                try {
                    string = base.decompress(string, compressions[i])
                    compression_fail = false
                    //console.log(`Compression ${compressions[i]} succeeded`)
                    break
                }
                catch(err) {
                    compression_fail = true
                    //console.log(`compresion ${compressions[i]} failed: ${err}`)
                    continue
                }
            }
        }
        return [string, compression_fail]
    }

    static process_string(string) {
        var processed = 0;
        var expected = string.length;
        var packets = [];
        while (processed < expected) {
            let len = base.unpack_value(new Buffer(string.slice(processed, processed+4)));
            processed += 4;
            packets = packets.concat(new Buffer(string.slice(processed, processed+len)));
            processed += len;
        }
        if (processed > expected)   {
            throw `Could not parse correctly processed=${processed}, expected=${expected}, packets=${packets}`;
        }
        return packets;
    }

    get compression_used() {
        /**
        *     .. js:attribute:: js2p.base.InternalMessage.compression_used
        *
        *         Returns the compression method used in this message, as defined in :js:data:`~js2p.base.flags`, or ``undefined`` if none
        */
        for (var i = 0; i < base.compression.length; i++) {
            for (var j = 0; j < this.compression.length; j++) {
                if (base.compression[i] === this.compression[j]) {
                    return base.compression[i];
                }
            }
        }
    }

    get time_58() {
        /**
        *     .. js:attribute:: js2p.base.InternalMessage.time
        *
        *         Returns the timestamp of this message
        *
        *
        *     .. js:attribute:: js2p.base.InternalMessage.time_58
        *
        *         Returns the timestamp encoded in base_58
        */
        return base.to_base_58(this.time);
    }

    get id() {
        /**
        *     .. js:attribute:: js2p.base.InternalMessage.id
        *
        *         Returns the ID/checksum associated with this message
        */
        try     {
            var payload_string = this.payload.join('')
            var payload_hash = base.SHA384(payload_string + this.time_58)
            return base.to_base_58(new BigInt(payload_hash, 16))
        }
        catch (err) {
            console.log(err);
            console.log(this.payload);
        }
    }

    get packets() {
        /**
        *     .. js:attribute:: js2p.base.InternalMessage.payload
        *
        *         Returns the payload "packets" associated with this message
        *
        *
        *     .. js:attribute:: js2p.base.InternalMessage.packets
        *
        *         Returns the total "packets" associated with this message
        */
        var meta = [this.msg_type, this.sender, this.id, this.time_58]
        return meta.concat(this.payload)
    }

    get __non_len_string() {
        var buf_array = [];
        var packets = this.packets;
        for (var i = 0; i < packets.length; i++)    {
            buf_array.push(base.pack_value(4, packets[i].length));
            buf_array.push(new Buffer(packets[i]));
        }
        var total = Buffer.concat(buf_array);
        if (this.compression_used) {
            total = base.compress(total, this.compression_used);
        }
        return total;
    }

    get string() {
        /**
        *     .. js:attribute:: js2p.base.InternalMessage.string
        *
        *         Returns a Buffer containing the serialized version of this message
        */
        var string = this.__non_len_string
        return Buffer.concat([base.pack_value(4, string.length), string]);
    }

    get length() {
        /**
        *     .. js:attribute:: js2p.base.InternalMessage.length
        *
        *         Returns the length of this message when serialized
        */
        return this.__non_len_string.length
    }

    len() {
        return pack_vlaue(4, this.length)
    }
};

base.message = class message {
    /**
    * .. js:class:: js2p.base.message(msg, server)
    *
    *     This is the message class we present to the user.
    *
    *     :param js2p.base.InternalMessage msg: This is the serialization object you received
    *     :param js2p.base.base_socket sender:      This is the "socket" object that received it
    */
    constructor(msg, server) {
        this.msg = msg
        this.server = server
    }

    inspect()   {
        var packets = this.packets;
        var type = packets[0];
        var payload = packets.slice(1);
        var text = "message {\n";
        text += ` type: ${util.inspect(type)}\n`;
        text += ` packets: ${util.inspect(payload)}\n`;
        text += ` sender: ${util.inspect(this.sender.toString())} }`;
        return text;
    }

    get time() {
        /**
        *     .. js:attribute:: js2p.base.message.time
        *
        *         Returns the time (in seconds UTC) this message was sent at
        */
        return this.msg.time
    }

    get time_58() {
        /**
        *     .. js:attribute:: js2p.base.message.time_58
        *
        *         Returns the time (in seconds UTC) this message was sent at, encoded in base_58
        */
        return this.msg.time_58
    }

    get sender() {
        /**
        *     .. js:attribute:: js2p.base.message.sender
        *
        *         Returns the ID of this message's sender
        */
        return this.msg.sender
    }

    get id() {
        /**
        *     .. js:attribute:: js2p.base.message.id
        *
        *         Returns the ID/checksum associated with this message
        */
        return this.msg.id
    }

    get packets() {
        /**
        *     .. js:attribute:: js2p.base.message.packets
        *
        *         Returns the packets the sender wished you to have, sans metadata
        */
        return this.msg.payload
    }

    get length() {
        /**
        *     .. js:attribute:: js2p.base.message.length
        *
        *         Returns the serialized length of this message
        */
        return this.msg.length
    }

    get protocol()  {
        /**
        *     .. js:attribute:: js2p.base.message.protocol
        *
        *         Returns the :js:class:`~js2p.base.protocol` associated with this message
        */
        return this.server.protocol
    }

    reply(packs) {
        /**
        *     .. js:function:: js2p.base.message.reply(packs)
        *
        *         Replies privately to this message.
        *
        *         .. warning::
        *
        *             Using this method has potential effects on the network composition.
        *             If you are not connected to the sender, we cannot garuntee
        *             the message will get through. If successful, you will experience
        *             higher network load on average.
        *
        *         :param packs: A list of packets you want the other user to receive
        */
        if (this.server.routing_table[this.sender]) {
            this.server.routing_table[this.sender].send(base.flags.whisper, [base.flags.whisper].concat(packs));
        }
        else    {
            var request_hash = base.SHA384(this.sender + base.to_base_58(base.getUTC()));
            var request_id = base.to_base_58(new BigInt(request_hash, 16));
            this.server.requests[request_id] = [packs, base.flags.whisper, base.flags.whisper];
            this.server.send([request_id, this.sender], base.flags.broadcast, base.flags.request);
            console.log("You aren't connected to the original sender. This reply is not guarunteed, but we're trying to make a connection and put the message through.");
        }
    }
};

base.base_connection = class base_connection   {
    /**
    * .. js:class:: js2p.base.base_connection(sock, server, outgoing)
    *
    *     This is the template class for connection abstracters.
    *
    *     :param sock:                          This is the raw socket object
    *     :param js2p.base.base_socket server:  This is a link to the :js:class:`~js2p.base.base_socket` parent
    *     :param outgoing:                      This bool describes whether ``server`` initiated the connection
    */
    constructor(sock, server, outgoing)   {
        this.sock = sock;
        this.server = server;
        this.outgoing = outgoing | false;
        this.buffer = new Buffer(0);
        this.id = null;
        this.time = base.getUTC();
        this.addr = null;
        this.compression = [];
        this.last_sent = [];
        this.expected = 4;
        this.active = false;
        var self = this;

        this.sock.on('data', function(data) {
            self.collect_incoming_data(self, data);
        });
        this.sock.on('end', function()  {
            self.onEnd();
        });
        this.sock.on('error', function(err)    {
            self.onError(err);
        });
        this.sock.on('close', function()    {
            self.onClose();
        });
    }

    onEnd() {
        /**
        *     .. js:function:: js2p.base.base_connection.onEnd()
        *
        *         This function is run when a connection is ended
        */
        console.log(`Connection to ${this.id || this} ended. This is the template function`);
    }

    onError(err)    {
        /**
        *     .. js:function:: js2p.base.base_connection.onError()
        *
        *         This function is run when a connection experiences an error
        */
        console.log(`Error: ${err}`);
        this.sock.end();
        this.sock.destroy();
    }

    onClose()   {
        /**
        *     .. js:function:: js2p.base.base_connection.onClose()
        *
        *         This function is run when a connection is closed
        */
        console.log(`Connection to ${this.id || this} closed. This is the template function`);
    }

    send_InternalMessage(msg)   {
        /**
        *     .. js:function:: js2p.base.base_connection.send_InternalMessage(msg)
        *
        *         Sends a message through its connection.
        *
        *         :param js2p.base.InternalMessage msg:      A :js:class:`~js2p.base.InternalMessage` object
        *
        *         :returns: the :js:class:`~js2p.base.InternalMessage` object you just sent, or ``undefined`` if the sending was unsuccessful
        */
        msg.compression = this.compression;
        // console.log(msg.payload);
        if (msg.msg_type === base.flags.whisper || msg.msg_type === base.flags.broadcast) {
            this.last_sent = [msg.msg_type].concat(packs);
        }
        // this.__print__(`Sending ${[msg.len()].concat(msg.packets)} to ${this}`, 4);
        if (msg.compression_used)   {
            //console.log(`Compressing with ${JSON.stringify(msg.compression_used)}`);
            // self.__print__(`Compressing with ${msg.compression_used}`, level=4)
        }
        // try {
            //console.log(`Sending message ${JSON.stringify(msg.string.toString())} to ${this.id}`);
            this.sock.write(msg.string, 'ascii')
            return msg
        // }
        // catch(e)   {
        //     self.server.daemon.exceptions.append((e, traceback.format_exc()))
        //     self.server.disconnect(self)
        // }
    }

    send(msg_type, packs, id, time)  {
        /**
        *     .. js:function:: js2p.base.base_connection.send(msg_type, packs, id, time)
        *
        *         Sends a message through its connection.
        *
        *         :param msg_type:      Message type, corresponds to the header in a :js:class:`~js2p.base.InternalMessage` object
        *         :param packs:         A list of Buffer-like objects, which correspond to the packets to send to you
        *         :param id:            The ID this message should appear to be sent from (default: your ID)
        *         :param number time:   The time this message should appear to be sent from (default: now in UTC)
        *
        *         :returns: the :js:class:`~js2p.base.InternalMessage` object you just sent, or ``undefined`` if the sending was unsuccessful
        */

        //This section handles waterfall-specific flags
        // console.log(packs);
        id = id || this.server.id;  //Latter is returned if key not found
        time = time || base.getUTC();
        //Begin real method
        var msg = new base.InternalMessage(msg_type, id, packs, this.compression, time);
        return this.send_InternalMessage(msg);
    }

    get protocol()  {
        return this.server.protocol;
    }

    collect_incoming_data(self, data) {
        /**
        *     .. js:function:: js2p.base.base_connection.collect_incoming_data(self, data)
        *
        *         Collects and processes data which just came in on the socket
        *
        *         :param self:          A reference to this connection. Will be refactored out.
        *         :param Buffer data:   The data which was just received
        */
        self.buffer = Buffer.concat([self.buffer, data]);
        //console.log(self.buffer);
        self.time = base.getUTC();
        while (self.buffer.length >= self.expected) {
            if (!self.active)   {
                // this.__print__(this.buffer, this.expected, this.find_terminator(), level=4)
                self.expected = base.unpack_value(self.buffer.slice(0, 4)).add(4);
                self.active = true;
                // this.found_terminator();
            }
            if (self.active && self.buffer.length >= self.expected) {  //gets checked again because the answer may have changed
                self.found_terminator();
            }
        }
        return true;
    }

    found_terminator()  {
        /**
        *     .. js:function:: js2p.base.base_connection.found_terminator()
        *
        *         This method is called when the expected amount of data is received
        *
        *         :returns: The deserialized message received
        */
        //console.log("I got called");
        var msg = base.InternalMessage.feed_string(this.buffer.slice(0, this.expected), false, this.compression);
        this.buffer = this.buffer.slice(this.expected);
        this.expected = 4;
        this.active = false;
        return msg;
    }

    handle_renegotiate(packets) {
        /**
        *     .. js:function:: js2p.base.base_connection.handle_renegotiate(packets)
        *
        *         This function handles connection renegotiations. This is used when compression methods
        *         fail, or when a node needs a message resent.
        *
        *         :param packs: The array of packets which were received to initiate the renegotiation
        *
        *         :returns: ``true`` if action was taken, ``undefined`` if not
        */
        if (packets[0] == base.flags.renegotiate)    {
            if (packets[4] == base.flags.compression)   {
                var encoded_methods = JSON.parse(packets[5]);
                var respond = (this.compression != encoded_methods);
                this.compression = encoded_methods;
                // self.__print__("Compression methods changed to: %s" % repr(self.compression), level=2)
                if (respond)    {
                    var decoded_methods = base.intersect(base.compression, this.compression);
                    self.send(base.flags.renegotiate, base.flags.compression, JSON.stringify(decoded_methods))
                }
                return true;
            }
            else if (packets[4] == base.flags.resend)   {
                var type = self.last_sent[0];
                var packs = self.last_sent.slice(1);
                self.send(type, packs);
                return true;
            }
        }
    }

    __print__() {

    }
};

base.base_socket = class base_socket   {
    /**
    * .. js:class:: js2p.base.base_socket(addr, port [, protocol [, out_addr [, debug_level]]])
    *
    *     This is the template class for socket abstracters.
    *
    *     :param string addr:                   The address you'd like to bind to
    *     :param number port:                   The port you'd like to bind to
    *     :param js2p.base.protocol protocol:   The subnet you're looking to connect to
    *     :param array out_addr:                Your outward-facing address
    *     :param number debug_level:            The verbosity of debug prints
    *
    *     .. js:attribute:: js2p.base.base_socket.routing_table
    *
    *         An object which contains :js:class:`~js2p.base.base_connection` s keyed by their IDs
    *
    *     .. js:attribute:: js2p.base.base_socket.awaiting_ids
    *
    *         An array which contains :js:class:`~js2p.base.base_connection` s that are awaiting handshake information
    */
    constructor(addr, port, protocol, out_addr, debug_level)   {
        var self = this;
        this.addr = [addr, port];
        this.incoming = new net.Server();
        this.incoming.listen(port, addr);
        this.protocol = protocol || base.default_protocol;
        this.out_addr = out_addr || this.addr;
        this.debug_level = debug_level || 0;

        this.awaiting_ids = [];
        this.routing_table = {};
        this.id = base.to_base_58(BigInt(base.SHA384(`(${addr}, ${port})${this.protocol.id}${base.user_salt}`), 16));
        this.__handlers = [];
        this.exceptions = [];
    }

    get status()    {
        /**
        *     .. js:attribute:: js2p.base.base_socket.status
        *
        *         This attribute describes whether the socket is operating as expected.
        *
        *         It will either return a string ``"Nominal"`` or a list of Error/Traceback pairs
        */
        if (this.exceptions.length) {
            return this.exceptions;
        }
        return "Nominal";
    }

    register_handler(callback)  {
        /**
        *     .. js:function:: js2p.base.base_socket.register_handler(callback)
        *
        *         This registers a message callback. Each is run through until one returns ``true``,
        *         rather like :js:func:`Array.some()`. The callback is expected to be of the form:
        *
        *         .. code-block:: javascript
        *
        *             function callback(msg, conn)  {
        *                 var packets = msg.packets;
        *                 if (packets[0] === some_expected_value)   {
        *                     some_action(msg, conn);
        *                     return true;
        *                 }
        *             }
        *
        *         :param function callback: A function formatted like the above
        */
        this.__handlers = this.__handlers.concat(callback);
    }

    handle_msg(msg, conn) {
        var ret = false;
        this.__handlers.some(function(handler)  {
            // self.__print__("Checking handler: %s" % handler.__name__, level=4)
            // console.log(`Entering handler ${handler.name}`);
            if (handler(msg, conn)) {
                // self.__print__("Breaking from handler: %s" % handler.__name__, level=4)
                // console.log(`breaking from ${handler.name}`);
                ret = true;
                return true
            }
        });
        return ret;
    }
};
