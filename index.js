'use strict'

/*
 * Nightwatch.js module to record the webdriver X11 display via ffmpeg.
 *
 * Copyright 2016, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 */

// Function to create a directory similar to the shell "mkdir -p" command:
function mkdirp (dir, mode) {
  const path = require('path')
  const fs = require('fs')
  dir = path.resolve(dir)
  if (fs.existsSync(dir)) return dir
  try {
    fs.mkdirSync(dir, mode)
    return dir
  } catch (error) {
    if (error.code === 'ENOENT') {
      return mkdirp(path.dirname(dir), mode) && mkdirp(dir, mode)
    }
    throw error
  }
}

module.exports = {
  start: function (browser, done) {
    const settings = browser.globals.test_settings
    const videoSettings = settings.videos
    const currentTest = browser.currentTest
    if (videoSettings && videoSettings.enabled) {
      const dateTime = new Date().toISOString().split('.')[0].replace(/:/g, '-')
      const format = videoSettings.format || 'mp4'
      const fileName = `${currentTest.module}-${dateTime}.${format}`
      const path = require('path')
      const file = path.resolve(path.join(videoSettings.path || '', fileName))
      let ffmpegOptions = this.options(videoSettings,settings,file);
      mkdirp(path.dirname(file))
        console.log(ffmpegOptions)
      browser.ffmpeg = require('child_process').execFile(
        'ffmpeg',
        ffmpegOptions,
        function (error, stdout, stderr) {
          browser.ffmpeg = null
          if (error) {
            // At the start, the video capture always logs an ignorable x11grab
            // "image data event_error", which we can safely ignore:
            const stderrLines = stderr.split('\n')
            if (stderrLines.length !== 2 ||
                !/x11grab .* image data event_error/.test(stderrLines[0])) {
              throw error
            }
          }
        }
      ).on('close', function () {
        // If on_failure is set, delete the video file unless the tests failed:
        if (videoSettings.delete_on_success && !currentTest.results.failed) {
          require('fs').unlink(file)
        }
      })
    }
    done()
  },
  options: function(videoSettings,settings,file) {
      let out = [];
      out.push('-video_size');
      out.push(videoSettings.resolution || '1440x900');
      out.push('-r');
      out.push(videoSettings.fps || 15);
      out.push('-f');
      out.push('x11grab');
      out.push('-i');
      out.push(settings.selenium_host + (videoSettings.display || ':60'));
      if (typeof videoSettings.preset != 'undefined' && videoSettings.preset != "") {
          out.push('-preset');
          out.push(videoSettings.preset);
      }
      if (typeof videoSettings.tune != 'undefined' && videoSettings.tune != "") {
          out.push('-tune');
          out.push(videoSettings.tune);
      }
      if (typeof videoSettings.pixel_format != 'undefined' && videoSettings.pixel_format != "") {
          out.push('-pix_fmt');
          out.push(videoSettings.pixel_format || 'yuv420p') // QuickTime compatibility
      }
      if (typeof videoSettings.x264 != 'undefined' && videoSettings.x264 != "") {
          out.push('-x264opts');
          out.push(videoSettings.x264);
      }
      out.push('-loglevel');
      out.push('error');
      out.push(file);
      return out
  },
  stop: function (browser, done) {
    const ffmpeg = browser.ffmpeg
    if (ffmpeg) {
      ffmpeg.on('close', function () { done() }).kill()
    } else {
      done()
    }
  }
}
