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
const webpack = require('webpack');
const path = require('path');

const NS = 'webpackParallelBuild';

ipc.config.silent = true;

ipc.connectTo(NS, () => {
  ipc.of[NS].on('kill', code => {
    process.exit(code);
  });

  ipc.of[NS].emit('webpackInit', JSON.stringify({
    filename: process.cwd()
  }));

  ipc.of[NS].on('webpack', (data) => {
    try {
      const {filename, watch, watchOptions} = JSON.parse(data);
      const config = require(path.resolve(filename, 'webpack.config.js'));
      const compiler = webpack(config);

      if (filename !== process.cwd()) {
        return;
      }

      console.log('<<<', 'Compiling', process.cwd());

      const cb = (error, stats) => {
        if (error) {
          ipc.of[NS].emit('webpackError', JSON.stringify({
            filename: process.cwd(),
            error
          }));
        } else {
          ipc.of[NS].emit('webpackResult', JSON.stringify({
            filename: process.cwd(),
            stats: stats.toString()
          }));
        }

        if (!watch) {
          process.exit(error ? 1 : 0);
        }
      };


      if (watch) {
        compiler.watch(Object.assign({
          aggregateTimeout: 300,
          poll: undefined
        }, watchOptions || {}), cb);
      } else {
        compiler.run(cb);
      }
    } catch (e) {
      ipc.of[NS].emit('webpackError', JSON.stringify({
        filename: process.cwd(),
        error: e.message
      }));

      process.exit(1);
    }
  });
});
