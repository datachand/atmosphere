// we used to store a single userId on the package, now we store a userIds list
var canEditPackage = function(pkg, userId) {
  var userId = userId || Meteor.userId();
  
  return userId && (pkg.userId === userId) || _.include(pkg.userIds, userId);
}


Meteor.methods({
  publish: function(pkgInfo) {

    Logs.insert({
      name: 'method.publish',
      userId: Meteor.userId(),
      pkgInfo: pkgInfo,
      stamp: new Date()
    });

    var pkgRecord = Packages.findOne({ name: pkgInfo.name });
    
    pkgInfo.author = _.parseAuthor(pkgInfo.author);

    var errors = _.validate(pkgInfo, [

      // Name
      _.presenceOf   ('name'),
      _.lengthOf     ('name', { gte: 1, lte: 30 }),
      function(doc){  
        if(doc.name != null && doc.name.indexOf(" ") != -1){   
            return {
                field: 'name',
                message: 'You cannot have spaces in your package name.'
            };
        }
      },

      // Description
      _.presenceOf   ('description'),
      _.lengthOf     ('description', { gte: 20, lte: 500 }),

      // Homepage
      _.presenceOf   ('homepage'),
      _.validUrl     ('homepage'),

      // Author name
      _.presenceOf   ('author.name'),
      _.lengthOf     ('author.name', { gte: 5, lte: 50 }),

      // Author email
      _.validEmail   ('author.email'),

      // Author url
      _.validUrl     ('author.url'),

      // Version
      _.presenceOf   ('version'),
      _.validVersion ('version'),

      // Git url
      _.presenceOf   ('git'),
      _.validUrl     ('git')

    ]);

    var errorMessages = _.flatErrors(errors);

    if (errorMessages.length > 0)
      throw new Meteor.Error(422, "Package could not be saved", errorMessages);

    var packageFields = [
      'name',
      'description',
      'homepage',
      'author',
      'version',
      'git',
      'packages',
      'visible',
      'meteor'
    ];

    // these are the fields that get saved to each version
    var versionFields = [
      'git',
      'version',
      'meteor',
      'packages',
      'createdAt',
      'troposphereIdentifier'
    ];
    
    var updatePackage = function(oldPkg, newPkg) {
      return _.each(packageFields, function(key) {
        if (key !== 'packages')
          oldPkg[key] = newPkg[key];
      });
    };

    // Get rid of keys we don't want
    pkgInfo = _.pick(pkgInfo, packageFields);

    // Setup defaults
    pkgInfo.visible = _.isUndefined(pkgInfo.visible) ? true : pkgInfo.visible;
    
    // prepare version
    var now = new Date().getTime();
    var versionRecord = _.pick(pkgInfo, versionFields);
    versionRecord.createdAt = now;
    versionRecord.updatedAt = now;
    
    // Ok we have one
    if (pkgRecord) {

      // Only the owner can update it
      if (! canEditPackage(pkgRecord))
        throw new Meteor.Error(401, "That ain't yr package son!");
      
      if (SemverHelper.isValidVersion(pkgRecord.latest) && ! Semver.gt(pkgInfo.version, pkgRecord.latest))
        throw new Meteor.Error(401, "That's not a new version of the package!");

      // Add new version
      pkgRecord.versions.push(versionRecord);

      // Assign packages
      if (pkgInfo.packages)
        pkgRecord.packages = pkgInfo.packages;

      // Timestamp it
      pkgRecord.updatedAt = new Date().getTime();
      pkgRecord.latest = pkgInfo.version;

      updatePackage(pkgRecord, pkgInfo);
      
      // Get the update ID first
      var id = pkgRecord._id;

      Notify.send('package', 'update', pkgRecord);

      // Do the update
      Packages.update(id, {
        $set: _.removeId(pkgRecord)
      });
    } else {

      var errors = _.validate(pkgInfo, [
        // Name
        _.uniquenessOf ('name', { in: Packages }),
      ]);

      var errorMessages = _.flatErrors(errors);

      if (errorMessages.length > 0)
        throw new Meteor.Error(422, "Package could not be saved", errorMessages);

      // Setup new package record
      var newPackage = _.extend(pkgInfo, {
        userIds: [Meteor.userId()],
        latest: pkgInfo.version,
        createdAt: now,
        updatedAt: now,
        versions: [versionRecord]
      });

      Notify.send('package', 'new', newPackage);

      // Insert it
      Packages.insert(newPackage);
    }
  },
  
  countInstall: function(name, version) {
    // console.log('Counting install of ' + version + ' of package ' + name);
    if (! version) {
      var pkg = Packages.findOne({name: name});
      version = pkg.latest;
    }
    
    // XXX: we don't actually use this stat and it causes a lot of 
    // updates to the package collection (== perf problems). 
    // Packages.update(
    //   {name: name, 'versions.version': version},
    //   {$inc: {installCount: 1, 'versions.$.installCount': 1}}
    // );
    
    Installs.insert({name: name, version: version, when: +(new Date)});
  },
  
  getReadMe:function(packageName) {
    var package = Packages.findOne({name:packageName});
    
    if(package) {
      var github_data = /\/\/github\.com\/([\w-_\.]+)\/([\w-_\.]+)\.git/i.exec(package.git);
      
      if(github_data) {
        var repo_owner = github_data[1];
        var repo_name = github_data[2];
        //var url = "https://api.github.com/repos/"+repo_owner+"/"+repo_name+"/readme"; //Base 64 contains binary data for some odd reason
        var url = "http://raw.github.com/"+repo_owner+"/" + repo_name + "/master/README.md";
        
        try {
          var result = Meteor.http.get(url,{headers:{"User-Agent":"Meteor Community Repository Bot"}});
          
          if(result.statusCode != 200) return false;
          
          var markdown = Meteor.http.post("https://api.github.com/markdown",{headers:{"User-Agent":"Meteor Community Repository Bot"}, data:{text:result.content}});
            
          if(markdown.headers["x-ratelimit-remaining"] == 0) {
            console.log("Hit githubs API limit")
            return 0;
          }
          
          return markdown.content;  
          
          
        }
        catch(err) {
          return false;
        }
        
        
      }
      else
      {
        return false;
      }
    }
    else
    {
      return false;
    }
  },
  
  CountInstall:function(packageName, version, isUpdate) {
    Logs.insert({
      name: 'method.countinstall',
      userId: Meteor.userId(),
      pkgInfo: pkgInfo,
      stamp: new Date()
    });
    
    Installs.insert({time:new Date(), version: version, isUpdate: isUpdate});
  },
  
  deletePackage: function(packageName) {
    Logs.insert({
      name: 'method.deletepackage',
      userId: Meteor.userId(),
      packageName: packageName,
      stamp: new Date()
    });
    
    var package = Packages.findOne({name: packageName});
    if (! canEditPackage(package))
      return "You're not authorized to delete this package";
    
    // XXX: don't actually delete a package, just mark it deleted.
    //
    // This seems better both because it lets people continue to use
    // it, as well as simplifying other things.
    //
    // The only downside is you can't "reclaim" names
    // Packages.remove({name: packageName});
    Packages.update({name: packageName}, {$set: {deleted: true}});
    return "Package removed";
  },
  
  addPackageMaintainer: function(packageName, username) {
    Logs.insert({
      name: 'method.addPackageMaintainer',
      userId: Meteor.userId(),
      packageName: packageName,
      stamp: new Date()
    });
    
    var package = Packages.findOne({name: packageName});
    if (! package || ! canEditPackage(package))
      return "You're not authorized to change this package";
    
    var user = Meteor.users.findOne({username: username});
    if (! user)
      return "No user with that username exists";
    
    Packages.update(package._id, {$addToSet: {userIds: user._id}});
  },
  
  // mark a package with a version identifier, e.g. iron:router@0.2.0
  markTroposphereIdentifier: function(packageName, version, identifier) {
    check(packageName, String);
    check(version, String);
    check(identifier, Match.Where(function(s) {
      check(s, String);
      return s.match(/.+:.+@.+/); 
    }));
    
    // XXX: check admin or something?
    Packages.update({name: packageName, 'versions.version': version}, {$set: {
      'versions.$.troposphereIdentifier': identifier
    }});
  }
});
