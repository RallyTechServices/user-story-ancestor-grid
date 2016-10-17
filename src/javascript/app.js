Ext.define("user-story-ancestor-grid", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'message_box',tpl:'Hello, <tpl>{_refObjectName}</tpl>'},
        {xtype:'container',itemId:'display_box'}
    ],

    integrationHeaders : {
        name : "user-story-ancestor-grid"
    },

    config: {
        defaultSettings: {
            query: ''
        }
    },

    launch: function() {
        this.fetchPortfolioItemTypes().then({
            success: this.initializeApp,
            failure: this.showErrorNotification,
            scope: this
        });

    },
    showErrorNotification: function(msg){
        Rally.ui.notify.Notifier.showError({
            message: msg
        });
    },
    initializeApp: function(portfolioTypes){
        this.portfolioItemTypeDefs = Ext.Array.map(portfolioTypes, function(p){ return p.getData();});
        this._buildGridboardStore();
    },
    getFeatureName: function(){
        return this.getFeatureTypePath().replace('PortfolioItem/','');
    },
    getFeatureTypePath: function(){
        return this.portfolioItemTypeDefs[0].TypePath;
        //return 'PortfolioItem/Feature';
    },
    getPortfolioItemTypePaths: function(){
        return _.pluck(this.portfolioItemTypeDefs, 'TypePath');
    },
    fetchPortfolioItemTypes: function(){
        return this.fetchWsapiRecords({
            model: 'TypeDefinition',
            fetch: ['TypePath', 'Ordinal','Name'],
            context: {workspace: this.getContext().getWorkspace()._ref},
            filters: [{
                property: 'Parent.Name',
                operator: '=',
                value: 'Portfolio Item'
            },
                {
                    property: 'Creatable',
                    operator: '=',
                    value: 'true'
                }],
            sorters: [{
                property: 'Ordinal',
                direction: 'ASC'
            }]
        });
    },
    fetchSnapshots: function(config){
        var deferred = Ext.create('Deft.Deferred');

        Ext.create('Rally.data.lookback.SnapshotStore', config).load({
            callback: function(snapshots, operation){
                if (operation.wasSuccessful()){
                    deferred.resolve(snapshots);
                } else {
                    deferred.reject('Failed to load snapshots: ', operation && operation.error && operation.error.errors.join(','))
                }
            }
        });

        return deferred;
    },
    getQueryFilter: function(){
        var query = this.getSetting('query');
        if (query && query.length > 0){
            this.logger.log('getQueryFilter', Rally.data.wsapi.Filter.fromQueryString(query));
            return Rally.data.wsapi.Filter.fromQueryString(query);
        }
        return [];
    },
    _buildGridboardStore: function(){
        this.logger.log('_buildGridboardStore');
        this.removeAll();

        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: this.getModelNames(),
            // autoLoad: true,
            enableHierarchy: true,
            fetch: [this.getFeatureName(),'ObjectID'],
            filters: this.getQueryFilter()
        }).then({
            success: this._addGridboard,
            failure: this.showErrorNotification,
            scope: this
        });
    },
    getModelNames: function(){
        return ['HierarchicalRequirement'];
    },
    getFeatureAncestorHash: function(){
        if (!this.featureAncestorHash){
            this.featureAncestorHash = {};
        }
        return this.featureAncestorHash;
    },
    setAncestors: function(records){
        var featureHash = this.getFeatureAncestorHash(),
            featureName = this.getFeatureName();
        for (var j=0; j<records.length; j++){
            var record = records[j],
                feature = record.get(featureName);
            if (feature){
                var objID = feature.ObjectID;
                var featureObj = featureHash[objID];
                for (var i=1; i<this.portfolioItemTypeDefs.length; i++){
                    var name = this.portfolioItemTypeDefs[i].Name.toLowerCase();
                    if (featureObj[name]){
                        record.set(name, featureObj[name]);
                    } else {
                        record.set(name, null);
                    }
                }
            }
        }
    },
    //updateFeatureHash: function(snapshots, portfolioItems){
    //    var hash = {};
    //    Ext.Array.each(portfolioItems, function(pi){
    //        hash[pi.get('ObjectID')] = pi.getData();
    //    });
    //
    //    var featureHash = this.getFeatureAncestorHash();
    //    Ext.Array.each(snapshots, function(s){
    //        var itemHierarchy = s.get('_ItemHierarchy'),
    //            objID = s.get('ObjectID');
    //        Ext.Array.each(itemHierarchy, function(i){
    //
    //            var ancestor = hash[i],
    //                ancestorName = hash[i]._type.replace('portfolioitem/','');
    //            if (!featureHash[objID]){
    //                featureHash[objID] = hash[objID];
    //            }
    //            if (featureHash[objID]){
    //                featureHash[objID][ancestorName] = ancestor;
    //            }
    //
    //        });
    //
    //    });
    //
    //    this.logger.log('updateFeatureHash', featureHash);
    //},
    updateFeatureHashWithWsapiRecords: function(results){
        var hash = {},
            features = [],
            featureTypePath = this.getPortfolioItemTypePaths()[0].toLowerCase(),
            ancestorNames = _.map(this.getPortfolioItemTypePaths(), function(pi){
                return pi.toLowerCase().replace('portfolioitem/','');
            });

        Ext.Array.each(results, function(res){
            Ext.Array.each(res, function(pi){
                hash[pi.get('ObjectID')] = pi.getData();
                if (pi.get('_type') === featureTypePath){
                    features.push(pi);
                }
            });
        });


        var featureHash = this.getFeatureAncestorHash();
        Ext.Array.each(features, function(s){

            var parent = s.get('Parent') && s.get('Parent').ObjectID || null,
                objID = s.get('ObjectID');

            if (!featureHash[objID]){
                featureHash[objID] = hash[objID];
                //initialize
                Ext.Array.each(ancestorNames, function(a){ featureHash[objID][a] = null; });
            }

            if (parent && featureHash[objID]){
                do {
                    var parentObj = hash[parent] || null,
                        parentName = hash[parent] && hash[parent]._type.replace('portfolioitem/','');


                    if (featureHash[objID]){
                        featureHash[objID][parentName] = parentObj;
                        parent = parentObj && parentObj.Parent && parentObj.Parent.ObjectID || null;
                    }
                } while (parent !== null);
            }
        });

    },
    fetchAncestors: function(featureOids){
        var deferred = Ext.create('Deft.Deferred');

        var promises = [];
        for (var i = 0; i< this.getPortfolioItemTypePaths().length; i++){
            var type = this.getPortfolioItemTypePaths()[i];

            var filterProperties = ['ObjectID'];
            for (var j=0; j<i; j++){
                filterProperties.unshift('Children');
            }
            var filterProperty = filterProperties.join('.');
            var filters = _.map(featureOids, function(f){
                return {
                    property: filterProperty,
                    value: f
                }
            });
            filters = Rally.data.wsapi.Filter.or(filters);
            this.logger.log('type', type, filters.toString());
            promises.push(this.fetchWsapiRecords({
                model: type,
                fetch: ['FormattedID','Name','Parent','ObjectID'],
                enablePostGet: true,
                limit: Infinity,
                pageSize: 1000,
                context: {project: null},
                filters: filters
            }));
        }

        Deft.Promise.all(promises).then({
            success: function(results){
                deferred.resolve(results);
            },
            failure: this.showErrorNotification,
            scope: this
        });
        return deferred;


    },
    //fetchPortfolioItems: function(snapshots){
    //    var deferred = Ext.create('Deft.Deferred');
    //
    //    var piOids = [];
    //    for (var i=0; i<snapshots.length; i++){
    //        var snap = snapshots[i].getData();
    //        piOids = Ext.Array.merge(piOids, snap._ItemHierarchy);
    //    }
    //
    //    var filters = _.map(piOids, function(pi){
    //        return {
    //            property: 'ObjectID',
    //            value: pi
    //        };
    //    });
    //
    //    filters = Rally.data.wsapi.Filter.or(filters);
    //
    //    Ext.create('Rally.data.wsapi.artifact.Store',{
    //        models: this.getPortfolioItemTypePaths(),
    //        fetch: ['FormattedID','Name','Parent','ObjectID'],
    //        filters: filters,
    //        enablePostGet: true,
    //        limit: Infinity,
    //        context: {project: null}
    //    }).load({
    //        callback: function(records, operation){
    //            if (operation.wasSuccessful()){
    //                deferred.resolve(records);
    //            } else {
    //                deferred.reject("Failed to load portfolio items: " + operation.error.errors.join(','));
    //            }
    //        }
    //    });
    //
    //    return deferred;
    //},
    updateStories: function(store, node, records, operation){
        this.logger.log('updateStories',records, operation);

        if (records.length === 0 || records[0].get('_type') !== 'hierarchicalrequirement'){
            return;
        }
        var featureName = this.getFeatureName(),
            featureHash = this.getFeatureAncestorHash(),
            featureOids = [];

        Ext.Array.each(records, function(r){
            var feature = r.get(featureName);
            if (feature && !featureHash[feature.ObjectID]){
                featureOids.push(feature.ObjectID);
            }
        }, this);

        if (featureOids.length > 0){
            this.fetchAncestors(featureOids).then({
                success: function(results){
                    this.updateFeatureHashWithWsapiRecords(results);
                    this.setAncestors(records);
                },
                failure: this.showErrorNotification,
                scope: this
            });
            //this.fetchSnapshots({
            //    find: {
            //        _TypeHierarchy: {$in: this.getPortfolioItemTypePaths() },
            //        __At: "current",
            //        _ItemHierarchy: {$in: featureOids}
            //    },
            //    fetch: ['ObjectId','FormattedID','Name','Parent','_ItemHierarchy'],
            //    limit: Infinity
            //}).then({
            //    success: function(snapshots){
            //        this.fetchPortfolioItems(snapshots).then({
            //            success: function(portfolioItems){
            //                this.updateFeatureHash(snapshots, portfolioItems);
            //                this.setAncestors(records);
            //            },
            //            failure: this.showErrorNotification,
            //            scope: this
            //        });
            //    },
            //    failure: this.showErrorNotification,
            //    scope: this
            //});
        } else {
            this.setAncestors(records)
        }
    },
    _addGridboard: function(store) {
        for (var i=1; i<this.portfolioItemTypeDefs.length; i++){
            var name =  this.portfolioItemTypeDefs[i].Name.toLowerCase();
            store.model.addField({name: name, type: 'auto', defaultValue: null});
        }
        store.on('load', this.updateStories, this);

        this.add({
            xtype: 'rallygridboard',
            context: this.getContext(),
            modelNames: this.getModelNames(),
            toggleState: 'grid',
            plugins: this.getGridPlugins(),
            stateful: false,
            gridConfig: {
                store: store,
                storeConfig: {
                    filters: this.getQueryFilter()
                },
                columnCfgs: this.getColumnConfigs(),
                derivedColumns: this.getDerivedColumns()
            },
            height: this.getHeight()
        });
    },
    getGridPlugins: function(){
        return [{
            ptype:'rallygridboardaddnew'
        },
            {
                ptype: 'rallygridboardfieldpicker',
                headerPosition: 'left',
                modelNames: this.getModelNames(),
                alwaysSelectedValues: [this.getFeatureName()],
                stateful: true,
                margin: '3 3 3 25',
                stateId: this.getContext().getScopedStateId('ancestor-columns-1')
            },{
                ptype: 'rallygridboardinlinefiltercontrol',
                inlineFilterButtonConfig: {
                    stateful: true,
                    stateId: this.getContext().getScopedStateId('ancestor-filters'),
                    modelNames: this.getModelNames(),
                    margin: 3,
                    inlineFilterPanelConfig: {
                        quickFilterPanelConfig: {
                            defaultFields: [
                                'ArtifactSearch',
                                'Owner',
                                'ModelType'
                            ]
                        }
                    }
                }
            }, {
                ptype: 'rallygridboardactionsmenu',
                menuItems: [
                    {
                        text: 'Export...',
                        handler: this._export,
                        scope: this
                    }
                ],
                buttonConfig: {
                    margin: 3,
                    iconCls: 'icon-export'
                }
            }];
    },
    _export: function() {
        window.location = Rally.ui.gridboard.Export.buildCsvExportUrl(
            this.down('rallygridboard').getGridOrBoard());
    },
    getColumnConfigs: function(){
        var cols = [{
            dataIndex: 'Name',
            text: 'Name'
        },{
            dataIndex: 'ScheduleState',
            text: 'Schedule State'
        },{
            dataIndex: this.getFeatureName(),
            text: this.getFeatureName()
        }].concat(this.getDerivedColumns());
        this.logger.log('cols', cols);
        return cols;
    },
    getDerivedColumns: function(){
        var cols = [];
        //Ext.Array.each(this.portfolioItemTypeDefs, function(p){
        for (var i = 1; i< this.portfolioItemTypeDefs.length; i++){

            var name = this.portfolioItemTypeDefs[i].Name.toLowerCase();

            cols.push({
               // dataIndex: name,
                ancestorName: name,
                xtype: 'ancestortemplatecolumn',
                text: this.portfolioItemTypeDefs[i].Name
            });
        }

        return cols;
    },
    fetchWsapiRecords: function(config){
        var deferred = Ext.create('Deft.Deferred');
        Ext.create('Rally.data.wsapi.Store',config).load({
            callback: function(records, operation){
                if (operation.wasSuccessful()){
                    deferred.resolve(records);
                } else {
                    deferred.reject(Ext.String.format('Failed to fetch {0} records: {1}',config.model ,operation && operation.error && operation.error.errors.join(',')));
                }
            }
        });
        return deferred;
    },
    
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    getSettingsFields: function(){
        return [{
            xtype: 'textarea',
            fieldLabel: 'Query Filter',
            name: 'query',
            anchor: '100%',
            cls: 'query-field',
            margin: '0 70 0 0',
            labelAlign: 'right',
            labelWidth: 100,
            plugins: [
                {
                    ptype: 'rallyhelpfield',
                    helpId: 194
                },
                'rallyfieldvalidationui'
            ],
            validateOnBlur: false,
            validateOnChange: false,
            validator: function(value) {
                try {
                    if (value) {
                        Rally.data.wsapi.Filter.fromQueryString(value);
                    }
                    return true;
                } catch (e) {
                    return e.message;
                }
            }
        }];
    },
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        // Ext.apply(this, settings);
        this._buildGridboardStore();
    }
});
