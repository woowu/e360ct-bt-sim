#!/usr/bin/node --harmony
'use strict';

const { SerialPort } = require('serialport');
const dump = require('buffer-hexdump');
const yargs = require('yargs/yargs');

const dataSamples = {
    'd1': Buffer.from([
        0x01, 0x02, 0x03, 0x04,
        0xff, 0xfe, 0xfd, 0xfc,
    ]),
    'd2': Buffer.from([
        0x01, 0x02, 0x03, 0x04,
        0x05, 0x06, 0x07, 0x08,
        0x09, 0x0a, 0x0b, 0x0c,
        0x0d, 0x0e, 0x0f, 0x00,
        0x11, 0x12, 0x13, 0x14,
        0x15, 0x16, 0x17, 0x18,
        0x19, 0x1a, 0x1b, 0x1c,
        0x1d, 0x1e, 0x1f, 0x10,
        0x21, 0x22, 0x23, 0x24,
        0x25, 0x26, 0x27, 0x28,
        0x29, 0x2a, 0x2b, 0xff, 0x2c,
        0x2d, 0x2e, 0x2f, 0x20,
        0x31, 0x32, 0x33, 0x34,
        0x35, 0x36, 0x37, 0x38,
        0x39, 0x3a, 0x3b, 0x3c,
        0x3d, 0x3e, 0x3f, 0x30,
    ]),
};

const commandSamples = {
    'unknown': Buffer.from([
        0xb, 0x01,
    ]),
    'invalid-code': Buffer.from([
        0x2, 0x01,
    ]),
    'invalid-len': Buffer.from([
        0xb, 0x2,
    ]),
    'setup': Buffer.from([
        0x5, 0x1,
    ]),
    'ready': Buffer.from([
        0x7, 0x1,
    ]),
    'status': Buffer.from([
        0x9, 0x5, 0x85, 0xb0, 0xc6,
    ]),
};

function openDev(path, baud)
{
    return new Promise((resolve, reject) => {
        const seri = new SerialPort({
            path: path,
            baudRate: baud
        });
        seri.on('open', () => resolve(seri));
    });
}

function listenDev(dev, dataCb, commandCb)
{
    var state;
    var len;
    var cs;
    const command = {
        code: null,
        info: [],
    };
    var timer;

    const sData = c => {
        if (c == 255)
            state = sEscaping;
        else
            dataCb(c);
    };
    const sChksum = c => {
        clearTimeout(timer);
        if (c != cs) {
            console.log(`bad checksum: ${c} vs ${cs}. command ${command.code}, info len ${command.info.length}`);
            console.log(dump(command.info));
        } else
            commandCb(command);
        state = sData;
    };
    const sInfo = c => {
        command.info.push(c);
        cs ^= c;
        if (! --len) state = sChksum;
    };
    const sLength = c => {
        if (c & 1 != 1)
            throw new Error(`bad length ${c}`);
        len = c >> 1;
        cs ^= c;
        state = len ? sInfo : sChksum;
    }
    const sCommand = c => {
        if (c & 1 != 1)
            throw new Error(`bad command code ${c}`);
        command.code = c >> 1;
        command.info = [];
        cs = 255 ^ c;
        state = sLength;
    };
    const sEscaping = c => {
        const COMMAND_PARSING_TIMEOUT = 2000;
        if (c == 255) {
            dataCb(c);
            state = sData;
        } else {
            state = sCommand;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                console.log("command parsing timeout, reset to data mode");
                state = sData;
            }, COMMAND_PARSING_TIMEOUT);
            state(c);
        }
    };

    state = sData;
    dev.on('data', data => {
        console.log('<');
        console.log(dump(data));
        for (const c of data) state(c);
    });
}

function sendData(dev, buf)
{
    const encoded = [];
    for (const c of buf) {
        encoded.push(c);
        if (c == 255) encoded.push(c);
    }
    const oBuf = Buffer.from(encoded);
    console.log('>')
    console.log(dump(oBuf));
    dev.write(oBuf);
}

function sendCommand(dev, buf, badChksum)
{
    var cs = buf.reduce((cs, c) => cs ^ c, 255);
    if (badChksum) cs = cs ^ 255;
    const oBuf = Buffer.concat([Buffer.from([255]), buf, Buffer.from([cs])]);
    console.log('>')
    console.log(dump(oBuf));
    dev.write(oBuf);
}

function sendRandomData(dev, len)
{
    const buf = [];
    for (var i = 0; i < len; ++i) buf.push(parseInt(Math.random() * 256));
    sendData(dev, Buffer.from(buf));
}

function sendSampleData(dev, name)
{
    if (! dataSamples[name]) {
        console.error(`not recoginized data sample ${name}`);
        return;
    }
    sendData(dev, dataSamples[name]);
}

function sendSampleCommand(dev, name, badChksum)
{
    if (! commandSamples[name]) {
        console.error(`not recoginized command sample ${name}`);
        return;
    }
    sendCommand(dev, commandSamples[name], badChksum);
}

/*---------------------------------------------------------------------------*/
function useData()
{
    var buf = [];
    var timer = null;
    return c => {
        if (timer) clearTimeout(timer);
        buf.push(c);
        timer = setTimeout(() => {
            buf = [];
        }, 50);
    };
}

function printCommand(cmd)
{
    console.log(`Command: code ${cmd.code} len ${cmd.info.length + 3}`);
}

function useCommand(cb)
{
    return cmd => {
        printCommand(cmd);
        cb(cmd);
    }
}

function mkSetupCommand(localName)
{
    const LOCAL_NAME_MAX = 32;
    const defaultLocalName = 'CC2340R5';
    const buf = [];
    var ln;

    buf.push(2 << 1 | 1);
    buf.push(0); // len
    buf.push(0x81, 0x00, 0x11, 0x22, 0x33, 0xff, 0xee); // Bluetooth address
    buf.push(0x82, 1, 0, 1); // Firmware version
    buf.push(0x83);
    ln = ! localName ? defaultLocalName : localName;
    ln = ln.slice(0, LOCAL_NAME_MAX);
    for (var i = 0; i < ln.length; ++i) {
        buf.push(ln.charCodeAt(i));
    }
    if (ln.length < LOCAL_NAME_MAX) buf.push(0);
    buf[1] = (buf.length - 2) << 1 | 1;
    return Buffer.from(buf);
}

function mkReadyCommand()
{
    const buf = [];
    buf.push(3 << 1 | 1);
    buf.push(1);
    return Buffer.from(buf);
}

/*---------------------------------------------------------------------------*/

const argv = yargs(process.argv.slice(2))
    .version('0.0.1')
    .option('d', {
        alias: 'device',
        type: 'string',
        demandOption: true,
        requiresArg: true,
    })
    .option('b', {
        alias: 'baud',
        type: 'number',
        default: 115200,
    })
    .command('send-data',
        'send data',
        yargs => {
            yargs
                .option('a', {
                    alias: 'sample',
                    type: 'string',
                    requiresArg: true,
                    describe: 'send data sample identified by the sample ID',
                })
                .option('r', {
                    alias: 'random',
                    type: 'number',
                    requiresArg: true,
                    describe: 'use random data with given length',
                });
        },
        async (argv) => {
            const dev = await openDev(argv.device, argv.baud);
            listenDev(dev, useData(), printCommand);
            if (argv.sample) {
                sendSampleData(dev, argv.sample);
                return;
            }
            if (argv.random) {
                sendRandomData(dev, argv.random);
                return;
            }
        })
    .command('send-cmd',
        'send command',
        yargs => {
            yargs
                .option('c', {
                    alias: 'sample',
                    type: 'string',
                    requiresArg: true,
                    describe: 'send sample command identified by the sample ID',
                })
                .option('s', {
                    alias: 'bad-chksum',
                    type: 'boolean',
                    describe: 'send command with bad checksum',
                });
        },
        async (argv) => {
            const dev = await openDev(argv.device, argv.baud);
            listenDev(dev, useData(), printCommand);
            if (argv.sample) {
                sendSampleCommand(dev, argv.sample, argv.badChksum);
                setTimeout(() => {
                    process.exit(0);
                }, 5000);
            }
        })
    .command('setup',
        'setup',
        yargs => {
            yargs
                .option('n', {
                    alias: 'local-name',
                    type: 'string',
                    describe: 'BLE local name',
                })
        },
        async (argv) => {
            const dev = await openDev(argv.device, argv.baud);
            listenDev(dev, useData(), useCommand(cmd => {
                setTimeout(() => {
                    sendCommand(dev, mkReadyCommand());
                }, 25);
            }));
            sendCommand(dev, mkSetupCommand(argv.localName));
        })
    .help()
    .argv;

