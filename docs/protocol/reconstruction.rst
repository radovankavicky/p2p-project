Reconstruction
==============

.. raw:: html

    <link rel="stylesheet" href="../_static/code_wrap.css" type="text/css">

Let's keep with our example from the previous section. How do we parse the resulting string?

First, check the first four bytes. Because we don't know how much data to receive through our socket, we always first check for a four byte header. Then we can toss it aside and collect that much information. If we know the message will be compressed, this is when it gets decompressed.

Next, we need to split up the packets. To do that, check the length field of each packet, then return a list of the specified regions. An example script would look like:

.. code-block:: python

    def get_packets(string):
        processed = 0
        packets = []
        while processed < len(string):
            pack_len = struct.unpack("!L", string[processed:processed+4])[0]
            processed += 4
            end = processed + pack_len
            packets.append(string[processed:end])
            processed = end
        return packets

From the above script we get back ``['broadcast', '6VnYj9LjoVLTvU3uPhy4nxm6yv2wEvhaRtGHeV9wwFngWGGqKAzuZ8jK6gFuvq737V', '72tG7phqoAnoeWRKtWoSmseurpCtYg2wHih1y5ZX1AmUvihcH7CPZHThtm9LGvKtj7', '3EfSDb', 'broadcast', 'test message']``

A node will use the entirety of this list to decide what to do with it. In this case, it would forward it to its peers, then present to the user the payload: ``['broadcast', 'test message']``.

Now that we know how to construct a message, examples will no longer include the headers. They will include the metadata and payload only.