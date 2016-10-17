Ext.define('CArABU.technicalservices.AncestorTemplateColumn', {
    extend: 'Ext.grid.column.Template',
    alias: ['widget.ancestortemplatecolumn'],

    align: 'right',

    initComponent: function(){
        var me = this;

        me.tpl = new Ext.XTemplate('<tpl><div style="text-align:right;">{[this.getAncestorString(values)]}</div></tpl>',{
            ancestorName: me.ancestorName,

            getAncestorString: function(values){
                if (values.FormattedID){
                    return Ext.String.format("<a href=\"{0}\" target=\"blank\">{1}</a>: {2}",Rally.util.Navigation.getDetailUrl(values), values.FormattedID, values.Name);
                }
                return '';
            }

        });
        me.hasCustomRenderer = true;
        me.callParent(arguments);
    },
    getValue: function(){
        return values[this.dataIndex] || 0;
    },
    defaultRenderer: function(value, meta, record) {
        var data = Ext.apply({}, record.get(this.ancestorName)); //, record.getAssociatedData());
        return this.tpl.apply(data);
    }
});