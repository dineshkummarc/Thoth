// the base model of a store

var sys = require('sys');
require('./sc/query');


global.ThothStore = SC.Object.extend({
   
   primaryKey: 'id', // put here the name of the primaryKey 
   
   filterBySCQuery: YES, // have SC Query filter the records if YES. The conditions and parameters are always passed on to the DB calls
   
   automaticRelations: YES, // have the store automatically parse the relations, The relations are always passed on to the DB calls
   
   // user functions
   
   /*
   the storeRequest is an object with the following layout:
   { bucket: '', 
     key: '', 
     conditions: '', 
     parameters: {}, 
     recordData: {},
     relations: [ 
        { bucket: '', type: 'toOne', propertyName: '', keys: [] }, 
        { bucket: '', type: 'toMany', propertyName: '', keys: [] } 
     ] 
   }
   
   
   */
   // functions to create, delete and fetch database records
   // use the callback function to send back the results as an array of records
   // make sure that the callback is called with an JS Array of objects and not with JSON data!
   
   // Be aware that in case you want to have automatic relations, these functions are also used to get the relation data
   // You can prevent automatic relations by not providing relation data in the request...
   
   createDBRecord: function(storeRequest,clientId,callback){
      // the callback expects the new record
      console.log("This function needs an implementation. If you are seeing this message, you are probably using the base ThothStore instead of a store having a DB-implementation.");
   },
   
   updateDBRecord: function(storeRequest,clientId,callback){
      // the callback expects the updated record
      console.log("This function needs an implementation. If you are seeing this message, you are probably using the base ThothStore instead of a store having a DB-implementation.");
   },
   
   deleteDBRecord: function(storeRequest,clientId,callback){
      // check for callbacks.. Often it is not included!
      console.log("This function needs an implementation. If you are seeing this message, you are probably using the base ThothStore instead of a store having a DB-implementation.");
   },
   
   fetchDBRecords: function(storeRequest,callback){
      // the callback expects an array of js objects, so make sure that the data has been parsed 
      console.log("This function needs an implementation. If you are seeing this message, you are probably using the base ThothStore instead of a store having a DB-implementation.");
   },
   
   refreshDBRecord: function(storeRequest,clientId,callback){
      // the callback expects a record
      console.log("This function needs an implementation. If you are seeing this message, you are probably using the base ThothStore instead of a store having a DB-implementation.");
   },
   
   createRelationRecord: function(){
     // the callback expects a record
     console.log("This function needs an implementation. If you are seeing this message, you are probably using the base ThothStore instead of a store having a DB-implementation.");     
   },
   
   deleteRelationRecord: function(){
     // the callback expects a record
     console.log("This function needs an implementation. If you are seeing this message, you are probably using the base ThothStore instead of a store having a DB-implementation.");     
   },
   
   // this function provides a hook for starting certain things when the server starts
   // which cannot be done using the init function (constructor)
   start: function(){
      console.log("This function needs an implementation. If you are seeing this message, you are probably using the base ThothStore instead of a store having a DB-implementation.");
   },
   
   
   /*
     Main store functions:
     fetch: will start a fetch all of a certain type of records, or a query, depending on the information
     refreshRecord: will refresh a certain type of record from the database
     createRecord: will create a new record with the specific data
     updateRecord: will update an existing record with the given data
     deleteRecord: will delete an existing record
     
     don't override, as these functions will also take care of the appropriate updates to the relations if
     the data for these relations is provided
     
   */
   
   fetch: function(storeRequest,clientId,callback){  
      // callback needs to be called with an object { recordResult: [ records ]}
      var bucket = storeRequest.bucket;
      var relations = storeRequest.relations;
      var conditions = storeRequest.conditions;
      var parameters = storeRequest.parameters;
      var me = this;
      if(bucket && callback){
         this.fetchDBRecords(storeRequest,function(data){
            // check for conditions
            var records = (conditions && me.filterBySCQuery)? me._filterRecordsByQuery(data,conditions,parameters): data;
            callback({ recordResult: records });
            // check whether there were relations in the original request
            if(me.automaticRelations && relations && (relations instanceof Array)){
               var junctionInfo;
               for(var i=0,len=relations.length;i<len;i++){
                  // for every relation, get the data
                  junctionInfo = me.getJunctionInfo(bucket,relations[i].bucket);
                  me.getRelationSet(relations[i],records,junctionInfo,callback);
               }
            }
         });
      }
   },
   
   refreshRecord: function(storeRequest,clientId,callback){
      // callback needs to be called with the record object
      var bucket = storeRequest.bucket, key = storeRequest.key;
      this.refreshDBRecord(storeRequest,clientId,function(record){
         callback({ refreshResult: record });
      });
      // relations
      var relations = storeRequest.relations;
      if(this.automaticRelations && relations && (relations instanceof Array)){
         var junctionInfo;
         for(var i=0,len=relations.length;i<len;i++){
            junctionInfo = this.getJunctionInfo(bucket,relations[i].bucket);
            this.getRelationSet(relations[i],storeRequest,junctionInfo,callback);
         }
      }
   },
   
   createRecord: function(storeRequest,clientId,callback){
      var bucket = storeRequest.bucket, key = storeRequest.key, record = storeRequest.recordData;
      var relations = storeRequest.relations;
      var me = this;
      this.createDBRecord(storeRequest,clientId,function(newrec){
         // the relations are created in this callback, as we need to have the
         // definite primaryKey value
         var prKeyValue = newrec[me.primaryKey];
         if(me.automaticRelations && relations && (relations instanceof Array)){
            var junctionInfo;
            for(var i=0,len=relations.length;i<len;i++){
               junctionInfo = me.getJunctionInfo(bucket,relations[i].bucket);
               if(relations.keys && (relations.keys instanceof Array) && (relations.keys.length > 0)){
                  me.createRelation(storeRequest,newrec,relations[i],clientId); // don't do callbacks here for the moment                  
                  newrec[relations[i].propertyName] = relations[i].keys;
               }
               else {
                  newrec[relations[i].propertyName] = [];
               }
            }
         }
         if(!newrec.bucket) newrec.bucket = bucket;
         callback(newrec);
      });
   },
   
   updateRecord: function(storeRequest,clientId,callback){
      sys.log('ThothStore: updateRecord called');
      var bucket = storeRequest.bucket, key = storeRequest.key, record = storeRequest.recordData;
      var relations = storeRequest.relations;
      // first update relations, because it allows to be sending the new relation data in one go with the record,
      // which makes distributing the changes much easier. This is because it seems rather tricky to distribute the relation
      // data before they are written in the db. With this setup the changes will be distributed around the same time as 
      // the data arrives to the database.
      if(this.automaticRelations && relations && (relations instanceof Array)){
         for(var i=0,l=relations.length;i<l;i++){
            var curRel = relations[i];
            this.updateRelation(storeRequest,record,curRel,clientId); 
            // no need for a callback
         }
      }
      sys.log("ThothStore: updateRecord: relations handled");
      this.updateDBRecord(storeRequest,clientId,function(record){
         // assume data is the updated record
         // merge the relation data with the record
         var currel;
         for(var j=0,len=relations.length;j<len;j++){
            currel = relations[j];
            record[currel.propertyName] = currel.keys;
         }
         // check if key is saved on the record
         if(!record.key) record.key = key;
         if(!record.bucket) record.bucket = bucket; // this is a temporary fix.
         callback(record); // now send the record with merged relations
      });
   },
   
   deleteRecord: function(storeRequest,clientId,callback){
      var bucket = storeRequest.bucket, key=storeRequest.key, relations = storeRequest.relations;
      // first destroy relations
      if(this.automaticRelations && relations && (relations instanceof Array)){
         for(var i=0,len=relations.length;i<len;i++){
            this.destroyRelation(storeRequest,relations[i],clientId); // for the moment, don't provide a callback
         }
      }
      // now delete the actual record
      this.deleteDBRecord(storeRequest,clientId,callback);
   },

   // relation resolving functions (COMPUTED PROPERTIES??)
   // Feel free to override them to have your own custom behaviour.
   // The standard functions create the junction table name by taking 
   // both resource names, sort them alphabetically and then join them by 
   // putting an underscore between them

   /*
    A few functions to do junction integration. 
    The place of these functions is probably not here... 
    
    Probably the way to do the relation stuff properly is either using a mixin for a 
    specific type of relation storing, but it may well be that these functions should be inside specific
    database stores...
    
    a few notes: at the moment Thoth doesn't really look at the kind of relation a record 
    The original idea was to store every relation as a many-to-many. The issue however with this at the moment
    is that Thoth doesn't cache actual record information. This caching would be needed as the SC Store doesn't
    support property based updates (needed to only update relations). This means that even if the record itself doesn't change
    both the record itself and the relations are updated.
    This defies the purpose of storing all relations as many-to-many (which is speeding up storage of changes)
   */

   junctionTableName: function(sideOne,sideTwo){
      return [sideOne,sideTwo].sort().join("_");
   },
   
   // function to generate a key name of a resource in the junction table
   // the standard is to take the resource name and add "_key" to it
   junctionKeyName: function(modelname){
      var prKey = this.primaryKey;
     return [modelname,prKey].join("_"); 
   },
   
   // function to generate all junction information in one go
   getJunctionInfo: function(model,relation){
      // return an object with all generated information about the relation:
      // { modelBucket: '', relationBucket: '', junctionBucket: '', modelRelationKey: '', relationRelationKey: ''}
      return {
        modelBucket: model,
        relationBucket: relation,
        junctionBucket: this.junctionTableName(model,relation),
        modelRelationKey: this.junctionKeyName(model),
        relationRelationKey: this.junctionKeyName(relation)
      };
   },



   // abstraction of the way relations are processed from junction records to relation sets belonging to a specific record
   // the issue here is that there are a few ways in which relations can be generated:
   // - as a relation set at a fetch function
   // - as a set of relation keys (for example in an update function)
   // - when creating a record the keys need to be created in the junction table
   // so the best idea seems to be to create three functions that each perform one of these tasks
   // and at the same time all use a specific set of helper functions that can be overrided

   //Function to filter out the relation keys between the record and the junctionData
   _junctionDataFor: function(record,junctionInfo,junctionData,allInfo){
      // parse the junctionData and search for the relations of the record in record
      // return an array of keys of the opposite of the relation if allInfo is false
      // if it is true, it returns the entire record
      var i, juncLen=junctionData.length;
      var modelKeyName = junctionInfo.modelRelationKey;
      var relationKeyName = junctionInfo.relationRelationKey;
      // create a fallback to "key" if the id doesn't exist. Necessary for refreshRecord requests, in that case record is the request information
      var curRecKey = record[this.primaryKey]? record[this.primaryKey]: record.key; 
      //sys.log("Trying to find a junction record with key " + modelKeyName + " and value " + curRecKey);
      var ret = [], curJuncRec;
      for(i=0;i<juncLen;i++){
         curJuncRec = junctionData[i];
         //sys.log("Parsing junction record: " + JSON.stringify(curJuncRec));
         if(curJuncRec[modelKeyName] == curRecKey){
            if(allInfo){
               ret.push(curJuncRec);
            }
            else {
               ret.push(curJuncRec[relationKeyName]);
            }
         } 
      }
      return ret;
   },

   getRelationSet: function(relation,records,junctionInfo,callback){
      // retrieve the relations and add them to the records
      // the function needs a callback, because it cannot be predicted when the junction records 
      // will be returned here.
      // The callback is called with an object: { relationSet: { bucket: junctionInfo.modelBucket, keys: retkeys, propertyName: relation.propertyName, data: {} }}
      // data is an associative array with the primaryKeys as key and the relation array as value
      
      // it might be interesting to implement this function as a recursive callback: take a list of relations, and do the first relations fetch, and let the callback
      // be this function... In that way relations can be returned in one go
      records = (records instanceof Array)? records: [records];
      var me = this;
      var primKey = this.primaryKey;
      //sys.log("retrieving relation data for " + JSON.stringify(junctionInfo));
      this.fetchDBRecords({bucket: junctionInfo.junctionBucket},function(junctionData){ // imitate sending a storeRequest
         var i,j,recLen=records.length,junctLen=junctionData.length; // indexes and lengths
         var currec, curRecKey,relationKeys, keys = [], data={};
         for(i=0;i<recLen;i++){
            currec = records[i];
            //sys.log("Parsing record: " + JSON.stringify(currec));
            // create the same fallback as for _junctionDataFor to "key" if the primaryKey doesn't exist on the record
            curRecKey = currec[primKey]? currec[primKey]: currec.key; 
            relationKeys = me._junctionDataFor(currec,junctionInfo,junctionData); 
            keys.push(curRecKey);
            data[curRecKey] = relationKeys;
         }
         var relSet = { relationSet: { bucket: junctionInfo.modelBucket, keys: keys, propertyName: relation.propertyName, data: data }};
         callback(relSet);
      });
   },
   
   getRelationKeys: function(relation,record,junctionInfo,callback){
      // this function does more or less the same as getRelationSet, but only for one record
      // so wrap createRelationSet
      var recordKey = record[this.primaryKey];
      this.getRelationSet(relation,record,junctionInfo,function(relationSet){
         var relSet = relationSet.relationSet;
         var data = relSet.data;
         callback(data[recordKey]);
      });
   },   
   
   updateRelation: function(storeRequest,record,relation,clientId,callback){
      // function to update an existing relation
      // so get all relation data for the current record and relation
      // check whether junction records need to be deleted or created
      var junctionInfo = this.getJunctionInfo(storeRequest.bucket,relation.bucket);
      //console.log("Junction info: " + JSON.stringify(junctionInfo));
      var me = this;
      this.fetchDBRecords({bucket:junctionInfo.junctionBucket},function(junctionData){ // fake sending a storeRequest
         var relationKeys = relation.keys.copy();
         //console.log('starting with relations: ' + JSON.stringify(relationKeys));
         var junctionRecs = me._junctionDataFor(storeRequest,junctionInfo,junctionData,true); // get all info on the records
         var relationsIndex,curRelKey;
         for(var i=0,l=junctionRecs.length;i<l;i++){
            curRelKey = junctionRecs[i][junctionInfo.relationRelationKey];
            relationsIndex = relationKeys.indexOf(curRelKey);
            if(relationsIndex == -1){ // not found, so delete the record
               me.deleteDBRecord({bucket: junctionInfo.junctionBucket, key:junctionRecs[i][me.primaryKey]}, clientId);
            }
            else {
               //console.log('deleting item at relationsIndex ' + relationsIndex);
               //console.log('value of item is ' + relationKeys[relationsIndex]);
               relationKeys.removeAt(relationsIndex);
            }
         }
         // now all relations that should be deleted are deleted, and relationKeys 
         // now only contains the relations that should be created
         // maybe createRelation could be used with only the keys left... but for the moment 
         // we do it manually
         var numrelations = relationKeys.length;
         var newRelRec, masterKey = storeRequest.key? storeRequest.key: record.key;
         var noKey = null; 
         //console.log('creating new relation records for ' + JSON.stringify(relationKeys));
         for(var j=0;j<numrelations;j++){
            newRelRec = {};
            newRelRec[junctionInfo.modelRelationKey] = masterKey;
            newRelRec[junctionInfo.relationRelationKey] = relationKeys[j];
            me.createDBRecord({bucket:junctionInfo.junctionBucket,key:noKey,recordData:newRelRec},clientId); // don't do callbacks on relations for the moment
         }
         // it might be a nice idea to have a callback here that creates a new relationSet which can be 
         // distributed...
         if(callback) callback(relation);
      });
   },
   
   createRelation: function(storeRequest,record,relation,clientId,callback){
      // function to create a relation, keys need to be in relation.keys
      var junctionInfo = this.getJunctionInfo(storeRequest.bucket,relation.bucket);
      //sys.puts("trying to create a set of relation records for master bucket " + storeRequest.bucket + " and related bucket: " + relation.bucket);
      //sys.puts("the relation is: " + JSON.stringify(relation));
      //sys.puts("the clientId is: " + clientId);
      var relationKeys = relation.keys;
      var masterKey = record[this.primaryKey];
      var newRelRec, noKey = null;
      for(var i=0,len=relationKeys.length;i<len;i++){
         newRelRec = {};
         newRelRec[junctionInfo.modelRelationKey] = masterKey;
         newRelRec[junctionInfo.relationRelationKey] = relationKeys[i];
         // now save by making up a storeRequest
         this.createDBRecord({bucket:junctionInfo.junctionBucket,key:noKey,recordData:newRelRec},clientId); // don't do callbacks on relations for the moment
      }
      if(callback) callback(YES);
   },
   
   destroyRelation: function(storeRequest,relation,clientId,callback){
      // function to destroy the relation data from relation, used by destroyRecord
      // first fetch all junction records belonging to the current record
      // storeRequest can also be a record
      var recKey = storeRequest.key;
      var junctionInfo = this.getJunctionInfo(storeRequest.bucket,relation.bucket);
      var me = this;
      var primKey = this.primaryKey;
      this.fetchDBRecords(junctionInfo.junctionBucket,function(junctionData){
         // get all junctioninfo for the current record
         var junctionRecs = me._junctionDataFor(storeRequest,junctionInfo,junctionData,true); // have it return the entire junction record
         var curJuncKey;
         for(var i=0,len=junctionRecs.length;i<len;i++){
            curJuncKey=junctionRecs[i][primKey];
            me.deleteDBRecord({bucket:junctionInfo.junctionBucket,key:curJuncKey},clientId); // fake a storeRequest
         }
         // in this implementation there is no error check...
         if(callback) callback(YES);
      });
   },

   
   // some very useful helper functions:

   // this function allows you to filter results by just feeding a set of records, 
   // an SC.Query conditions string and parameters object
   _filterRecordsByQuery: function(records,conditions,parameters){
      // function to filter a set of records to the conditions and parameters given
      // it creates a temporary query object
      if(records){
         var query = SC.Query.create({conditions: conditions, parameters: parameters});
         query.parse();
         var currec, ret = [];
         for(var i=0,len=records.length;i<len;i++){
            currec = records[i];
            // WARNING: the query language should not get the property using .get() as the
            // records the query object is called with are NOT SC.Record objects and calling 
            // .get on them to get the property value results in a call to the wrapper function 
            // in this case resulting in a call to the function created by the store._createRiakFetchOnSuccess function
            if(query.contains(currec)){ 
               ret.push(currec); 
            }
         }
         return ret;         
      }
   }
   
});