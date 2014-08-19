Meteor.publish('packageMetadata', function(keywords) {
  var regexp = new RegExp(keywords, 'i');
  return Packages.find({
    visible: { $ne: false }, deleted: { $ne: true },
    $or:[{name: regexp},{description:regexp}]
  }, {
    fields: {name: true, description: true, latest: true, updatedAt: true},
    sort: {'updatedAt': -1},
    limit: 50
  });
});

Meteor.publish('package', function(name) {
  return Packages.find({
    name: name
  });
});

// for meteorite
Meteor.publish('packages', function(lastModified) {
  // Logs.insert({
  //   name: 'publish.packages',
  //   userId: this.userId,
  //   stamp: new Date()
  // });
  
  var query = {
    visible: {$ne: false}
  };
  
  if (lastModified) {
    query.updatedAt = {$gt: +(lastModified)};
    console.log('publishing packages since', moment(lastModified).format('lll'))
  }
    


  return Packages.find(query, {
    sort: {updatedAt: -1}
  });
});

Meteor.publish('allPackages', function() {

  // Logs.insert({
  //   name: 'publish.allPackages',
  //   userId: this.userId,
  //   stamp: new Date()
  // });

  return Packages.find({}, {
    sort: {
      updatedAt: -1
    }
  });
});

Meteor.publish('usernames', function() {
  return Meteor.users.find({}, {fields: {'services.meteor-developer.username': 1}});
});

Meteor.publish('installs', function(since) {
  console.log('publishing installs since', moment(since).format('lll'))
  return Installs.find({when: {$gt: +(since)}});
})

// auto publish current user services info
Meteor.publish(null, function() {
  return Meteor.users.find(this.userId, {fields: {'services.meteor-developer': true}});
});