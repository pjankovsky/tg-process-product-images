'use strict';
const IMAGE_BUCKET = 'tg-catalog-images';
const IMAGE_BASEPATH = 'https://s3-us-west-2.amazonaws.com/' + IMAGE_BUCKET;

let AWS = require('aws-sdk');
let S3 = new AWS.S3({apiVersion: '2006-03-01'});
let http = require('http');
let dbCatalog = require('tg-node-lib/lib/db/catalog');
let url = require('url');
let querystring = require('querystring');

exports.handler = (event, context, callback) => {
    // setup returns a promise
    // doing setup each instance might be overkill, but it is better than doing it every time a table is loaded
    dbCatalog.setup()
        .then(() => {
            return poll()
        })
        .then((res) => callback(null, res))
        .catch((err) => callback(err, null));
};

function poll() {
    console.log('-- Poll Database');
    return dbCatalog.ProductImage()
        .findAll({where: {needsUpdate: 1}, limit: 100})
        .then((images) => {
            var updates = [];
            for (var i = 0; i < images.length; i++) {
                updates.push(syncImageFile(images[i]));
            }
            return Promise.all(updates);
        })
        .then((images) => {

        });
}

function syncImageFile(image) {
    console.log('--- Sync Image - ' + image.id);
    return new Promise((resolve, reject) => {
        http.get(image.amazonUrl, (res) => resolve(res)).on('error', (err) => reject(err));
    })
        .then((result) => {
            return new Promise((resolve) => {
                console.log('---- Upload Image');
                S3.putObject({
                    Bucket: IMAGE_BUCKET,
                    Key: querystring.unescape(url.parse(image.amazonUrl).pathname.substr(1)),
                    ACL: 'public-read',
                    Body: result,
                    ContentType: result.headers['content-type'],
                    ContentLength: result.headers['content-length'],
                    StorageClass: 'REDUCED_REDUNDANCY'
                }, (err) => {
                    if (err)
                        throw err;
                    resolve(image);
                });
            });
        })
        .then((image) => {
            console.log('---- Save Image to DB');
            image.url = IMAGE_BASEPATH + url.parse(image.amazonUrl).pathname;
            image.needsUpdate = 0;
            return image.save();
        })
        .catch((err) => {
            console.log(err);
            return false;
        })
}

