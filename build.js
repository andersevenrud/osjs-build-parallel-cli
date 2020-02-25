/*!
 * OS.js - JavaScript Cloud/Web Desktop Platform
 *
 * Copyright (c) 2011-2018, Anders Evenrud <andersevenrud@gmail.com>
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @author  Anders Evenrud <andersevenrud@gmail.com>
 * @licence Simplified BSD License
 */

const ipc = require('node-ipc');
const path = require('path');
const {spawn} = require('child_process');

const NS = 'webpackParallelBuild';
const withJSON = cb => arg => cb(JSON.parse(arg));

const initialProcs = configs => Object.fromEntries(
  configs.map(filename => ([
    filename,
    {
      proc: null,
      active: false,
      finished: false,
      inited: false,
      filename,
    }
  ]))
);

const spawnProcess = (cwd) => {
  console.log('>>>', 'Using', cwd);
  const script = path.resolve(__dirname, 'webpack.js');
  const proc = spawn('node', [script], {cwd});
  proc.stdout.on('data', str => console.log(str.toString()));
  proc.stderr.on('data', str => console.error(str.toString()));
  return proc;
};

const main = ({
  configs,
  concurrency,
  watch
}) => async (resolve, reject) => {
  let isFinished = false;

  const procs = initialProcs(configs);
  const killAll = () => Object.values(procs)
    .forEach(({proc}) => {
      if (proc) {
        try {
          proc.kill();
        } catch (e) {
          console.warn(e);
        }
      }
    });


  const nextRun = () => {
    const active = Object.values(procs)
      .filter(({active}) => active)
      .length;

    const count = concurrency - active;

    const next = Object.keys(procs)
      .filter(key => !procs[key].finished)
      .slice(0, count);

    next.forEach((key) => {
      const object = procs[key];

      object.active = true;

      ipc.server.broadcast('webpack', JSON.stringify({
        watch,
        filename: object.filename
      }));
    });
  };

  const checkInited = () => {
    const ready = Object.values(procs)
      .every(({inited}) => inited);

    if (ready) {
      nextRun();
    }
  };

  const checkFinished = () => {
    if (!watch) {
      isFinished = Object.values(procs)
        .every(({finished}) => finished);

      if (isFinished) {
        killAll();

        return true;
      }
    }

    return false;
  };

  ipc.server.on('webpackInit', withJSON(({filename}) => {
    procs[filename].inited = true;
    checkInited();
  }));

  ipc.server.on('webpackError', withJSON(({error, filename}) => {
    console.error(`An error occured in ${filename}`, error);

    procs[filename].finished = true;
    procs[filename].active = false;

    if (!watch && !isFinished) {
      killAll();
      reject(new Error('An error occured while building'));
    }

    nextRun();
  }));

  ipc.server.on('webpackResult', withJSON(({stats, filename}) => {
    console.log(stats);

    procs[filename].finished = true;
    procs[filename].active = false;

    if (checkFinished()) {
      killAll();
      resolve();
    }

    nextRun();
  }));

  Object.keys(procs).forEach((key) => {
    procs[key].proc = spawnProcess(procs[key].filename);
  });
};

module.exports = (config) => {
  const wrapper = (cb) => (...args) => {
    try {
      ipc.server.stop();
    } catch (e) {
      console.warn(e);
    }

    cb(...args);
  };

  console.log(`Starting parallel webpack build (concurrency: ${config.concurrency}, watch: ${config.watch})`);

  return new Promise((resolve, reject) => {
    ipc.config.id = NS;
    ipc.config.silent = true;

    ipc.serve(() => main(config)(
      wrapper(resolve),
      wrapper(reject)
    ));

    ipc.server.start();
  });
};
