Ext.define('RallyTechServices.inlinefilter.AncestorFilterRow', {
    alias: 'widget.rallyancestorfilterrow',
    extend: 'Rally.ui.inlinefilter.AdvancedFilterRow',

    layout: 'hbox',
    bubbleEvents: ['filterchange'],
    cls: 'advanced-filter-row',
    flex: 2,

    config: {
        context: undefined,
        model: undefined,
        autoExpand: false,
        name: undefined,
        operator: undefined,
        rawValue: undefined,
        addButtonEnabled: false,
        removeButtonEnabled: false,
        ancestorFieldConfig: {},
        propertyFieldConfig: {},
        operatorFieldConfig: {},
        focusPropertyField: false
    },

    isValid: function() {
        return this._hasPropertySelected() && this._hasOperatorSelected() && this._valueFieldIsValid();
    },
    _getFeatureName: function(){
        if (!this.featureName){
            var records = this.ancestorField && this.ancestorField.getStore() && this.ancestorField.getStore().getRange();
            Ext.Array.each(records, function(r){
                if (r.get('Ordinal') === 0){
                    var typePath = r.get('TypePath');
                    this.featureName = typePath.replace('PortfolioItem/','');
                }
            }, this);
        }
        return this.featureName;
    },
    getFilter: function() {
        if (this.isValid()) {
            var ancestorRecord = this.ancestorField.getRecord(),
                property = this.propertyField.lastValue,
                operator = this.operatorField.lastValue,
                valueField = this.valueField;

            var lastValue = Ext.isEmpty(valueField.lastValue) ? null : valueField.lastValue;

            var isRefUri = Rally.util.Ref.isRefUri(lastValue);
            var isRefOid = _.isNumber(Rally.util.Ref.getOidFromRef(lastValue));
            if (isRefUri && isRefOid && valueField.valueField === '_ref' && valueField.noEntryValue !== lastValue) {
                var record = valueField.getRecord();
                if (record) {
                    var uuidRef = record.get('_uuidRef');
                    if (uuidRef) {
                        lastValue = uuidRef;
                    }
                }
            }

            if (ancestorRecord && ancestorRecord.get('TypePath')){
                var ordinal = ancestorRecord.get('Ordinal');
                var propertyPrefix = [this._getFeatureName()];

                if (ordinal === 0){
                    propertyPrefix.push(property);
                } else {
                    for (var i=0; i<ordinal; i++){
                        propertyPrefix.push('Parent');
                    }
                    propertyPrefix.push(property);
                }
                property = propertyPrefix.join('.');
            }

            var filter = Rally.data.wsapi.Filter.fromExtFilter({
                property: property,
                operator: operator,
                value: lastValue
            });

            if (valueField.allowNoEntry && valueField.noEntryValue === lastValue) {
                filter.value = null;
            }

            Ext.apply(filter, {
                name: property,
                rawValue: lastValue,
                filterIndex: this.filterIndex
            });

            return filter;
        }
    },

    _fixPropertyFieldInIE: function() {
        if (Ext.isIE10m && this.propertyField.inputEl) {
            this.propertyField.setValue(this.propertyField.getValue());
        }
    },
    _onTypeAncestorStoreLoad: function(store, records){

        var ancestor = this.name && this.name.split(".");
        var idx = undefined,
            thisVal = null;

        if (ancestor && ancestor.length > 1){
            idx = ancestor.length - 2;
        }

        Ext.Array.each(records, function(r){
           if (r.get('Ordinal') === 0){
               var typePath = r.get('TypePath');
               this.featureName = typePath.replace('PortfolioItem/','');
           }

            if (idx === r.get('Ordinal')){
                thisVal = r.get('TypePath');
                return false;
            }

       }, this);

       if (thisVal){
           this.name = ancestor.slice(-1)[0];
           this.ancestorField.setValue(thisVal);

           this.originalName = this.name;
           this.originalOperator = this.operator;
           this.originalValue = this.rawValue;

           this._onAncestorSelect(this.ancestorField);
       }

    },
    _createAncestorField: function(){

        this.ancestorField = Ext.widget(Ext.merge({
            xtype: 'rallycombobox',
            itemId: 'ancestorField',
            autoExpand: this.autoExpand,
            storeConfig: {
                model: 'TypeDefinition',
                fetch: ['TypePath','DisplayName','Ordinal','Name'],
                filters: [{
                    property: 'TypePath',
                    operator: 'contains',
                    value: 'PortfolioItem/'
                }],
                autoLoad: true,
                listeners: {
                    load: this._onTypeAncestorStoreLoad,
                    scope: this
                },
                remoteFilter: true
            },
            allowNoEntry: true,
            cls: 'indexed-field property-field',
            width: 100,
            labelAlign: 'top',
            fieldLabel: 'OBJECT',
            valueField: 'TypePath',
            displayField: 'Name',
            labelSeparator: '',
            noEntryText: 'User Story',
            listeners: {
                select: this._onAncestorSelect,
                scope: this
            }
        }, this.ancestorFieldConfig));
    },

    _createIndexLabel: function() {
        this.indexLabel = Ext.widget({
            xtype: 'label',
            itemId: 'indexLabel',
            cls: 'index-label',
            hidden: true,
            listeners: {
                el: {
                    click: function () {
                        this.propertyField.expand();
                    },
                    scope: this
                },
                afterrender: {
                    fn: function() {
                        this.indexLabel.el.show();
                    },
                    scope: this,
                    single: true
                }
            },
            text: this._getFilterIndexText(this.filterIndex)
        });
    },

    _getItems: function() {
        this._createAddRowButton();
        this._createRemoveRowButton();
        this._createIndexLabel();
        this._createAncestorField();
        this._createPropertyField();
        this._createOperatorField();
        this._createValueField();

        return [
            this.addRowButton,
            this.removeRowButton,
            this.indexLabel,
            this.ancestorField,
            this.propertyField,
            this.operatorField,
            this.valueField
        ];
    },

    _hasAncestorSelected: function() {
        return !!this.ancestorField.getValue();
    },

    _replacePropertyField: function() {
        var deferred = new Deft.Deferred();

        this.name = this.originalName || undefined;
        this.propertyField.destroy();
        this._createPropertyField();
        this.propertyField.store.on('load', function() {
            deferred.resolve();
        });
        this.add(this.propertyField);
        return deferred.promise;
    },

    _replaceOperatorField: function() {
        var deferred = new Deft.Deferred();
        delete this.operator;
        this.operatorField.destroy();
        this._createOperatorField();
        this.operatorField.store.on('load', function() {
            if (this.originalOperator){ //set this so that filters update
                this.operatorField.setValue(this.originalOperator);
                this._applyFilters();
                delete this.originalOperator;
            }
            deferred.resolve();
        }, this);

        this.add(this.operatorField);
        return deferred.promise;
    },

    _replaceValueField: function() {
        delete this.rawValue;
        this.rawValue = this.originalValue || undefined;
        delete this.originalValue;

        this.valueField.destroy();
        this._createValueField();
        this.add(this.valueField);
        return Deft.Promise.when();
    },
    _onAncestorSelect: function() {

        var type = this.ancestorField.getValue() || 'HierarchicalRequirement';
        Rally.data.ModelFactory.getModel({
            type: type,
            success: function(model) {
                this.model = model;

                if (this.name){
                    var names = this.name.split('.');
                    this.name = names.slice(-1)[0];
                }

                Deft.Promise.all([
                    this._replacePropertyField(),
                    this._replaceOperatorField(),
                    this._replaceValueField()
                ]).then({
                    success: function() {
                        //We only want to do this once
                        delete this.originalName;
                        delete this.originalOperator;
                        delete this.originalValue;

                        this._applyFilters();
                        this.propertyField.focus(false, 200);
                    },
                    scope: this
                });
            },
            scope: this
        });
    }
});