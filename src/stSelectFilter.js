ng.module('smart-table')
    .directive('stSelectFilter', ['$interpolate', '$log', function ($interpolate, $log) {
        return {
            replace: true,
            require: '^stTable',
            scope: {
                predicate: '=?stSelectFilter',
                attrOptions: '=?options',
                attSelected: '=?selected',
                comparator: '&'
            },

            template: function(tElement, tAttrs) {
                var emptyLabel = tAttrs.emptyLabel ? tAttrs.emptyLabel : '';
                return '<select data-ng-model="selected" data-ng-options="option.value as option.label for option in options">' +
                       '<option value="">' + emptyLabel + '</option></select>';
            },
            link: function (scope, element, attr, ctrl) {
                var tableCtrl = ctrl;
                var filter;
                var FILTER_NAME = 'selectFilter';

                if (attr.comparator) {
                    var comparator = scope.comparator();

                    // Custom filter name for comparator, standard name plus name of comparator function.
                    // This way we prevent making multiple filters for the same comparator.
                    var customFilterName = FILTER_NAME + '_' + comparator.name;

                    filter = ctrl.registerFilter(customFilterName , comparator, null);
                } else {

                   // default we use strict comparison
                   filter = ctrl.registerFilter(FILTER_NAME, true, null);
                }

                if (scope.attrOptions) {
                    if (scope.attrOptions.length>0 && (typeof scope.attrOptions[0] === 'object')) {

                        // options as array of objects, eg: [{label:'green', value:true}, {label:'red', value:false}]
                        scope.options = scope.attrOptions.slice(0); // copy values

                        // keep watching if the options change outside of the table
                        scope.$watch("attrOptions", function() {
                            scope.options = scope.attrOptions.slice(0);
                        });
                    } else {

                        // options as simple array, eg: ['apple', 'banana', 'cherry', 'strawberry', 'mango', 'pineapple'];
                        scope.options = getOptionObjectsFromArray(scope.attrOptions);

                        // keep watching if the options change outside of the table
                        scope.$watch("attrOptions", function() {
                            scope.options = getOptionObjectsFromArray(scope.attrOptions);
                        });
                    }
                } else {
                    if (angular.isUndefined(scope.predicate) || scope.predicate === '') {
                        $log.error('Empty predicate value not allowed for st-select-filter');
                    }
                    if (scope.predicate === '$') {
                        $log.error('Predicate value \'$\' only allowed for st-select-filter when combined with attribute \'options\'');
                    }

                    // if not explicitly passed then determine the options by looking at the content of the table.
                    scope.options = getOptionObjectsFromArray(ctrl.getUniqueValues(scope.predicate));

                    // when the table data is updated, also update the options
                    scope.$on('st-safeSrcChanged', function() {
                        scope.options = getOptionObjectsFromArray(ctrl.getUniqueValues(scope.predicate));

                        // if currently selected filter value is no longer an option in the list, reset filter.
                        if (scope.selected !== null && !scope.options.some(function(option) {
                                return option.value === scope.selected;
                            })) {
                            scope.selected = null;
                            tableCtrl.applyFilter(scope.selected, scope.predicate, filter);
                        }
                    });
                }

                // if a label expression is passed than use this to create custom labels.
                if (attr.label) {
                    var strTemplate = attr.label.replace('[[', '{{').replace(']]', '}}');
                    var template = $interpolate(strTemplate);
                    scope.options.forEach(function(option) {
                        option.label = template(option);
                    });
                }

                element.on('change', function() {
                    if (angular.isUndefined(scope.predicate) || scope.predicate === '') {
                      $log.error('Empty predicate not allowed, assign a predicate value to st-select-filter. Use \'$\' to filter globally.');
                      return;
                    }
                    tableCtrl.applyFilter(scope.selected, scope.predicate, filter);
                    scope.$parent.$digest();
                });

                //table state -> view
                scope.$watch(function () {
                    return filter.predicateObject;
                }, function (newValue, oldValue) {
                    if (newValue !== oldValue) {
                        var predicateObject = newValue;
                        var predicateExpression = scope.predicate || '$';
                        if (predicateObject && predicateObject[predicateExpression] !== element[0].value) {
                            scope.attSelected = predicateObject[predicateExpression] || '';
                        }
                    }
                }, true);

                // view --> table state
                scope.$watch(function () {
                    return scope.attSelected;
                }, function (newValue, oldValue) {
                    if (newValue === oldValue) {

                        // if new and old value are the same than this is the initial call. If a value is set than this a default or pre selected.
                        // here where not going to use applyFilter because we're still in the initialization phase.
                        if (newValue && newValue !== '') {
                            var predicateExpression = scope.predicate || '$';
                            filter.predicateObject[predicateExpression] = newValue;
                            scope.selected = newValue;
                        }
                    } else {
                        var validOption = scope.options.some(function(option) {
                            return option.value === newValue;
                        });

                        scope.attSelected = validOption ? newValue : null;
                        if (scope.selected !== scope.attSelected) {
                            scope.selected = scope.attSelected;
                            tableCtrl.applyFilter(scope.selected, scope.predicate, filter);
                        }
                    }
                });
            }
        };
    }]);

function getOptionObjectsFromArray(options) {
    return options.map(function(val) {
        return {label: val, value: val};
    });
}

