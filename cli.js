/*
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

const fs = require('fs');
const path = require('path');
const {promisify} = require('util');
const main = require('./build.js');

const existsAsync = promisify(fs.exists);
const realpathAsync = promisify(fs.realpath);

const mapPackageConfig = async (filename) => {
  const realpath = await realpathAsync(filename);
  return await existsAsync(path.resolve(realpath, 'webpack.config.js'))
    ? realpath
    : false;
};

const readPackageConfigurations = async (resolve, packagesList) => {
  const packages = require(packagesList);
  const files = packages.map(resolve);
  const paths = files.map(mapPackageConfig);
  const results = await Promise.all(paths);
  return results.filter(res => !!res);
};

const parseCustomArgs = args => {
  if (typeof args.with === 'string') {
    return [args.with];
  } else if (args.with instanceof Array) {
    return args.with;
  }
  return [];
};

const buildAll = async ({args, options}) => {
  const root = args.root || process.cwd();
  const resolve = filename => path.resolve(root, filename);
  const withCustom = parseCustomArgs(args);

  const packages = args['with-packages']
    ? await readPackageConfigurations(resolve, options.packages)
    : [];

  return main({
    concurrency: args.concurrency || 1,
    watch: !!args.watch,
    configs: [
      ...packages,
      ...withCustom.map(resolve),
      path.resolve(root)
    ]
  });
};

module.exports = () => ({
  'build:parallel': {
    action: buildAll,
    description: 'Builds or watches all packages etc.',
    options: {
      '--root': 'Root directory (defaults to cwd)',
      '--watch': 'Toggle watch mode',
      '--with <paths...>': 'Include paths into build',
      '--with-packages': 'Build packages (off by default)',
      '--concurrency': 'Concurrency concurrency (default: 1)'
    }
  }
});
