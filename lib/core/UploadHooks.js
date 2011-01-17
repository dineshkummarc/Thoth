var sys = require('sys');
var fs = require('fs');

exports.UploadHooks = SC.Object.extend({
   
   uploadHooksFile: null, // file name to load
    
   _uploadHooks: null, // object to put the loaded file to
   
   _uploadResult: null, // cache to save the information needed to return a specific request
                     // best to be an object: 
                     // { 'cachekey': { mimeType: '', filePath: '' } }
   
   callUploadFunction: function(functionName, params, callback){
      sys.log('ThothUploadHooks: callUploadFunction called');
      if(!this._uploadHooks){
         if(!this.uploadHooksFile) sys.log("No uploadHooksFile defined on UploadHooks Module");
         else {
            var upload = require("../." + this.uploadHooksFile);
            //var upload = require("." + this.uploadHooksFile);
            if(!upload) return NO;
            else this._uploadHooks = upload;            
         }
      }
      var func = this._uploadHooks[functionName],
          me = this;
      if(func){
         var cacheKey = me.generateCacheKey();
         params.cacheKey = cacheKey; // give function access to cacheKey for tmpfile stuff
         func(params,function(result,isURL){
            //{ mimeType: '', responseObject: '', filePath: '' }
            var ret = { uploadResult: {} };
            var mimeType = result.mimeType,
                record = result.responseObject, 
                filePath = result.filePath;
            if(mimeType === 'application/json'){
               ret.uploadResult.record = record;
               callback(ret);
            }
            else {
               if(!me._uploadResult) me._uploadResult = {};
               me._uploadResult[cacheKey] = { mimeType: mimeType, filePath: filePath };
               ret.uploadResult.cacheKey = cacheKey;
               callback(ret);
            }
         });
      }
      else {
         callback({ uploadError: "Error"}); // don't let the message be too obvious...
      }
   },
   
   uploadRetrieve: function(cacheKey,callback){
      // function to return the file from the request
      // it should also clean up the file after the response has been completed
      // function should use the callback to notify the client
      // syntax: callback(mimeType,data);
      sys.log("ThothUploadHooks: uploadRetrieve called");
      var uploadResponse = this._uploadResult[cacheKey];
      var me = this; // needed by the clean up
      if(uploadResponse && uploadResponse.filePath && uploadResponse.mimeType){
         var filePath = uploadResponse.filePath, mimeType = uploadResponse.mimeType;
         sys.log("ThothUploadHooks: about to read file: " + filePath);
         fs.readFile(filePath,function(err,data){
            if(err){
               sys.log("ThothUploadHooks: Error while reading: " + err);
               callback(null);
            } 
            else {
               callback(mimeType,data);
               fs.unlink(filePath);
               delete me._uploadCache[cacheKey]; 
            } 
         });
      }
      else {
         delete this._uploadResult[cacheKey]; // clean up
         callback(null);
      }
   },
   
   generateCacheKey: function(){
      // the idea for this method was copied from the php site: 
      // http://www.php.net/manual/en/function.session-regenerate-id.php#60478
      var keyLength = 32,
          keySource = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
          keySourceLength = keySource.length + 1, // we need to add one, to make sure the last character will be used in generating the key
          ret = [],
          curCharIndex = 0;
      
      for(var i=0;i<=keyLength;i++){
         curCharIndex = Math.floor(Math.random()*keySourceLength);
         ret.push(keySource[curCharIndex]);
      }
      return ret.join('');
   }
   
});
