/** 
* @version 1.4.12
* @license MIT
*/
(function (ng, undefined){
    'use strict';

ng.module('smart-table', []).run(['$templateCache', function ($templateCache) {
    $templateCache.put('template/smart-table/pagination.html',
        '<nav ng-if="pages.length >= 2"><ul class="pagination">' +
        '<li ng-repeat="page in pages" ng-class="{active: page==currentPage}"><a ng-click="selectPage(page)">{{page}}</a></li>' +
        '</ul></nav>');
}]);


ng.module('smart-table')
    .controller('stTableController', ['$scope', '$parse', '$filter', '$attrs', function StTableController($scope, $parse, $filter, $attrs) {
        var propertyName = $attrs.stTable;
        var displayGetter = $parse(propertyName);
        var displaySetter = displayGetter.assign;
        var safeGetter;
        var orderBy = $filter('orderBy');
        var filter = $filter('filter');
        var safeCopy = copyRefs(displayGetter($scope));
        var tableState = {
            sort: {},
            filters: {},
            pagination: {
                start: 0
            }
        };
        var pipeAfterSafeCopy = true;
        var ctrl = this;
        var lastSelected;



        /**
         * sort the rows
         * @param {Function | String} predicate - function or string which will be used as predicate for the sorting
         * @param [reverse] - if you want to reverse the order
         */
        this.sortBy = function sortBy(predicate, reverse) {
            tableState.sort.predicate = predicate;
            tableState.sort.reverse = reverse === true;

            if (ng.isFunction(predicate)) {
              tableState.sort.functionName = predicate.name;
            } else {
              delete tableState.sort.functionName;
            }

            tableState.pagination.start = 0;
            return this.pipe();
        };

        /**
         * Register a filter
         * @param {String} name - name of filter
         * @param {function(actual, expected)|true|undefined} comparator Comparator which is used in determining if the
         *     expected value (from the filter expression) and actual value (from the object in the array) should be
         *     considered a match. See also https://docs.angularjs.org/api/ng/filter/filter.
         * @param {String|undefined} emptyValue Value that represents a 'no filter' value.
         * @returns {Object} - filter object with predicateObject and comparator.
         */
        this.registerFilter = function(name, comparator, emptyValue) {
            if (tableState.filters===undefined) {
                tableState.filters = {};
            }
            var filter = tableState.filters[name];
            if (filter===undefined) {
                filter = {
                    comparator: comparator,
                    predicateObject: {},
                    emptyValue: (emptyValue!==undefined ? emptyValue : '')
                };
                tableState.filters[name] = filter;
            }
            return filter;
        };

        /**
         * search matching rows
         * @deprecated this method is only meant for backwards compatibility.
         * @param {String} input - the input string
         * @param {String} [predicate] - the property name against you want to check the match, otherwise it will search on all properties
         */
        this.search = function search(input, predicate) {
            var searchFilter = this.registerFilter('search'); // make sure 'search' filter exists, get copy if already registered.
            this.applyFilter(input, predicate, searchFilter);
        };

        /**
         * apply filter to row data
         * @param {String} input - the input string
         * @param {String} predicate - the property name against you want to check the match, otherwise it will search on all properties
         * @param {Object} filter - the filter that is going to be applied
         */
        this.applyFilter = function(input, predicate, filter) {
            var prop = predicate || '$';
            filter.predicateObject[prop] = input;
            // to avoid to filter out null value
            if (input===filter.emptyValue) {
                delete filter.predicateObject[prop];
            }
            tableState.pagination.start = 0;
            return this.pipe();
        };

        /**
         * this will chain the operations of sorting and filtering based on the current table state (sort options, filtering, ect)
         */
        this.pipe = function pipe() {
            var pagination = tableState.pagination;

            var filtered = safeCopy;
            angular.forEach(tableState.filters, function(filterObj) {
                var predicateObject = filterObj.predicateObject;
                if (Object.keys(predicateObject).length > 0) {
                    filtered = filter(filtered, predicateObject, filterObj.comparator);
                }
            });

            if (tableState.sort.predicate) {
                filtered = orderBy(filtered, tableState.sort.predicate, tableState.sort.reverse);
            }
            if (pagination.number !== undefined) {
                pagination.numberOfPages = filtered.length > 0 ? Math.ceil(filtered.length / pagination.number) : 1;
                pagination.start = pagination.start >= filtered.length ? (pagination.numberOfPages - 1) * pagination.number : pagination.start;
                filtered = filtered.slice(pagination.start, pagination.start + parseInt(pagination.number));
            }
            displaySetter($scope, filtered);
        };

        /**
         * select a dataRow (it will add the attribute isSelected to the row object)
         * @param {Object} row - the row to select
         * @param {String} [mode] - "single" or "multiple" (multiple by default)
         */
        this.select = function select(row, mode) {
            var rows = safeCopy;
            var index = rows.indexOf(row);
            if (index !== -1) {
                if (mode === 'single') {
                    row.isSelected = row.isSelected !== true;
                    if (lastSelected) {
                        lastSelected.isSelected = false;
                    }
                    lastSelected = row.isSelected === true ? row : undefined;
                } else {
                    rows[index].isSelected = !rows[index].isSelected;
                }
            }
        };

        /**
         * take a slice of the current sorted/filtered collection (pagination)
         *
         * @param {Number} start - start index of the slice
         * @param {Number} number - the number of item in the slice
         */
        this.slice = function splice(start, number) {
            tableState.pagination.start = start;
            tableState.pagination.number = number;
            return this.pipe();
        };

        /**
         * return the current state of the table
         * @returns {{sort: {}, search: {}, filters: {}, pagination: {start: number}}}
         */
        this.tableState = function getTableState() {

            // for backwards compatibility, make sure tableState.search exists.
            tableState.search = tableState.filters.search ? tableState.filters.search : {};

            return tableState;
        };

        /**
         * Use a different filter function than the angular FilterFilter
         * @param filterName the name under which the custom filter is registered
         */
        this.setFilterFunction = function setFilterFunction(filterName) {
            filter = $filter(filterName);
        };

        /**
         *User a different function than the angular orderBy
         * @param sortFunctionName the name under which the custom order function is registered
         */
        this.setSortFunction = function setSortFunction(sortFunctionName) {
            orderBy = $filter(sortFunctionName);
        };

        /**
         * Usually when the safe copy is updated the pipe function is called.
         * Calling this method will prevent it, which is something required when using a custom pipe function
         */
        this.preventPipeOnWatch = function preventPipe() {
            pipeAfterSafeCopy = false;
        };

        /**
         * Convenient method to determine the unique values for a given predicate.
         * This method is used in stSelectFilter to determine the options for the select element.
         */
        this.getUniqueValues = function(predicate) {
            var seen;
            var getter = $parse(predicate);
            return safeCopy
                .map(function(el) {
                    return getter(el);
                })
                .sort()
                .filter(function(el) {
                    if (seen === undefined || seen !== el) {
                        seen = el;
                        return true;
                    }
                    return false;
                });
        };



        // The constructor logic is moved down to appear under the definitions of the member functions. This to make
        // sure the pipe function is defined before we attempt to call it.

        function copyRefs(src) {
            return src ? [].concat(src) : [];
        }

        function updateSafeCopy() {
            safeCopy = copyRefs(safeGetter($scope));
            if (pipeAfterSafeCopy === true) {
                ctrl.pipe();
            }
        }

        if ($attrs.stSafeSrc) {
            safeGetter = $parse($attrs.stSafeSrc);

            $scope.$watchGroup([function() {
                var safeSrc = safeGetter($scope);
                return safeSrc ? safeSrc.length : 0;
            }, function() {
                return safeGetter($scope);
            }], function(newValues, oldValues) {
                if (oldValues[0] !== newValues[0] || oldValues[1] !== newValues[1]) {
                    updateSafeCopy();
                    $scope.$broadcast('st-safeSrcChanged', null);
                }
            });

            // make sure that stTable is defined on $scope. Either implicitly by calling updateSafeCopy or explicitly.
            // by calling displaySetter.
            updateSafeCopy();
            if (pipeAfterSafeCopy !== true) {
                displaySetter($scope, safeCopy);
            }
        }
    }])
    .directive('stTable', function () {
        return {
            restrict: 'A',
            controller: 'stTableController',
            link: function (scope, element, attr, ctrl) {

                if (attr.stSetFilter) {
                    ctrl.setFilterFunction(attr.stSetFilter);
                }

                if (attr.stSetSort) {
                    ctrl.setSortFunction(attr.stSetSort);
                }
            }
        };
    });

ng.module('smart-table')
    .directive('stSearch', ['$timeout', function ($timeout) {
        return {
            require: '^stTable',
            scope: {
                predicate: '=?stSearch'
            },
            link: function (scope, element, attr, ctrl) {
                var tableCtrl = ctrl;
                var promise = null;
                var throttle = attr.stDelay || 400;
                var filter = ctrl.registerFilter('search');

                scope.$watch('predicate', function (newValue, oldValue) {
                    if (newValue !== oldValue) {
                        delete filter.predicateObject[oldValue];
                        tableCtrl.applyFilter(element[0].value, newValue, filter);
                    }
                });

                //table state -> view
                scope.$watch(function () {
                    return filter.predicateObject;
                }, function (newValue) {
                    var predicateObject = newValue;
                    var predicateExpression = scope.predicate || '$';
                    if (predicateObject && predicateObject[predicateExpression] !== element[0].value) {
                        element[0].value = predicateObject[predicateExpression] || '';
                    }
                }, true);

                // view -> table state
                element.bind('input', function (evt) {
                    evt = evt.originalEvent || evt;
                    if (promise !== null) {
                        $timeout.cancel(promise);
                    }
                    promise = $timeout(function () {
                        tableCtrl.applyFilter(evt.target.value, scope.predicate, filter);
                        promise = null;
                    }, throttle);
                });
            }
        };
    }]);

ng.module('smart-table')
    .directive('stSelectFilter', ['$interpolate', function ($interpolate) {
        return {
            replace: true,
            require: '^stTable',
            scope: {
                predicate: '=?stSelectFilter',
                attrOptions: '=?options',
                selected: '=?value',
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

                if (attr.hasOwnProperty('comparator')) {

                    // We have to use a getter to get the actual function?!
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
                    } else {

                        // options as simple array, eg: ['apple', 'banana', 'cherry', 'strawberry', 'mango', 'pineapple'];
                        scope.options = getOptionObjectsFromArray(scope.attrOptions);
                    }
                } else {

                    // if not explicitly passed then determine the options by looking at the content of the table.
                    scope.options = getOptionObjectsFromArray(ctrl.getUniqueValues(scope.predicate));

                    // when the table data is updated, also update the options
                    scope.$on('st-safeSrcChanged', function() {
                        scope.options = getOptionObjectsFromArray(ctrl.getUniqueValues(scope.predicate));
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
                    tableCtrl.applyFilter(scope.selected, scope.predicate, filter);
                    scope.$parent.$digest();
                });
            }
        };
    }]);

function getOptionObjectsFromArray(options) {
    return options.map(function(val) {
        return {label: val, value: val};
    });
}


ng.module('smart-table')
  .directive('stSelectRow', function () {
    return {
      restrict: 'A',
      require: '^stTable',
      scope: {
        row: '=stSelectRow'
      },
      link: function (scope, element, attr, ctrl) {
        var mode = attr.stSelectMode || 'single';
        element.bind('click', function () {
          scope.$apply(function () {
            ctrl.select(scope.row, mode);
          });
        });

        scope.$watch('row.isSelected', function (newValue) {
          if (newValue === true) {
            element.addClass('st-selected');
          } else {
            element.removeClass('st-selected');
          }
        });
      }
    };
  });

ng.module('smart-table')
  .directive('stSort', ['$parse', function ($parse) {
    return {
      restrict: 'A',
      require: '^stTable',
      link: function (scope, element, attr, ctrl) {

        var predicate = attr.stSort;
        var getter = $parse(predicate);
        var index = 0;
        var classAscent = attr.stClassAscent || 'st-sort-ascent';
        var classDescent = attr.stClassDescent || 'st-sort-descent';
        var stateClasses = [classAscent, classDescent];
        var sortDefault;

        if (attr.stSortDefault) {
          sortDefault = scope.$eval(attr.stSortDefault) !== undefined ?  scope.$eval(attr.stSortDefault) : attr.stSortDefault;
        }

        //view --> table state
        function sort() {
          index++;
          predicate = ng.isFunction(getter(scope)) ? getter(scope) : attr.stSort;
          if (index % 3 === 0 && attr.stSkipNatural === undefined) {
            //manual reset
            index = 0;
            ctrl.tableState().sort = {};
            ctrl.tableState().pagination.start = 0;
            ctrl.pipe();
          } else {
            ctrl.sortBy(predicate, index % 2 === 0);
          }
        }

        element.bind('click', function sortClick() {
          if (predicate) {
            scope.$apply(sort);
          }
        });

        if (sortDefault) {
          index = attr.stSortDefault === 'reverse' ? 1 : 0;
          sort();
        }

        //table state --> view
        scope.$watch(function () {
          return ctrl.tableState().sort;
        }, function (newValue) {
          if (newValue.predicate !== predicate) {
            index = 0;
            element
              .removeClass(classAscent)
              .removeClass(classDescent);
          } else {
            index = newValue.reverse === true ? 2 : 1;
            element
              .removeClass(stateClasses[index % 2])
              .addClass(stateClasses[index - 1]);
          }
        }, true);
      }
    };
  }]);

ng.module('smart-table')
  .directive('stPagination', function () {
    return {
      restrict: 'EA',
      require: '^stTable',
      scope: {
        stItemsByPage: '=?',
        stDisplayedPages: '=?',
        stPageChange: '&'
      },
      templateUrl: function (element, attrs) {
        if (attrs.stTemplate) {
          return attrs.stTemplate;
        }
        return 'template/smart-table/pagination.html';
      },
      link: function (scope, element, attrs, ctrl) {

        scope.stItemsByPage = scope.stItemsByPage ? +(scope.stItemsByPage) : 10;
        scope.stDisplayedPages = scope.stDisplayedPages ? +(scope.stDisplayedPages) : 5;

        scope.currentPage = 1;
        scope.pages = [];

        function redraw() {
          var paginationState = ctrl.tableState().pagination;
          var start = 1;
          var end;
          var i;
          var prevPage = scope.currentPage;
          scope.currentPage = Math.floor(paginationState.start / paginationState.number) + 1;

          start = Math.max(start, scope.currentPage - Math.abs(Math.floor(scope.stDisplayedPages / 2)));
          end = start + scope.stDisplayedPages;

          if (end > paginationState.numberOfPages) {
            end = paginationState.numberOfPages + 1;
            start = Math.max(1, end - scope.stDisplayedPages);
          }

          scope.pages = [];
          scope.numPages = paginationState.numberOfPages;

          for (i = start; i < end; i++) {
            scope.pages.push(i);
          }

          if (prevPage!==scope.currentPage) {
            scope.stPageChange({newPage: scope.currentPage});
          }
        }

        //table state --> view
        scope.$watch(function () {
          return ctrl.tableState().pagination;
        }, redraw, true);

        //scope --> table state  (--> view)
        scope.$watch('stItemsByPage', function (newValue, oldValue) {
          if (newValue !== oldValue) {
            scope.selectPage(1);
          }
        });

        scope.$watch('stDisplayedPages', redraw);

        //view -> table state
        scope.selectPage = function (page) {
          if (page > 0 && page <= scope.numPages) {
            ctrl.slice((page - 1) * scope.stItemsByPage, scope.stItemsByPage);
          }
        };

        if(!ctrl.tableState().pagination.number){
          ctrl.slice(0, scope.stItemsByPage);
        }
      }
    };
  });

ng.module('smart-table')
  .directive('stPipe', function () {
    return {
      require: 'stTable',
      scope: {
        stPipe: '='
      },
      link: {

        pre: function (scope, element, attrs, ctrl) {
          if (ng.isFunction(scope.stPipe)) {
            ctrl.preventPipeOnWatch();
            ctrl.pipe = function () {
              return scope.stPipe(ctrl.tableState(), ctrl);
            }
          }
        },

        post: function (scope, element, attrs, ctrl) {
          ctrl.pipe();
        }
      }
    };
  });

})(angular);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy90b3AudHh0Iiwic3JjL3NtYXJ0LXRhYmxlLm1vZHVsZS5qcyIsInNyYy9zdFRhYmxlLmpzIiwic3JjL3N0U2VhcmNoLmpzIiwic3JjL3N0U2VsZWN0RmlsdGVyLmpzIiwic3JjL3N0U2VsZWN0Um93LmpzIiwic3JjL3N0U29ydC5qcyIsInNyYy9zdFBhZ2luYXRpb24uanMiLCJzcmMvc3RQaXBlLmpzIiwic3JjL2JvdHRvbS50eHQiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FDRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDeFFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNsRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNoRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQy9FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3hCQSIsImZpbGUiOiJzbWFydC10YWJsZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiAobmcsIHVuZGVmaW5lZCl7XG4gICAgJ3VzZSBzdHJpY3QnO1xuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScsIFtdKS5ydW4oWyckdGVtcGxhdGVDYWNoZScsIGZ1bmN0aW9uICgkdGVtcGxhdGVDYWNoZSkge1xuICAgICR0ZW1wbGF0ZUNhY2hlLnB1dCgndGVtcGxhdGUvc21hcnQtdGFibGUvcGFnaW5hdGlvbi5odG1sJyxcbiAgICAgICAgJzxuYXYgbmctaWY9XCJwYWdlcy5sZW5ndGggPj0gMlwiPjx1bCBjbGFzcz1cInBhZ2luYXRpb25cIj4nICtcbiAgICAgICAgJzxsaSBuZy1yZXBlYXQ9XCJwYWdlIGluIHBhZ2VzXCIgbmctY2xhc3M9XCJ7YWN0aXZlOiBwYWdlPT1jdXJyZW50UGFnZX1cIj48YSBuZy1jbGljaz1cInNlbGVjdFBhZ2UocGFnZSlcIj57e3BhZ2V9fTwvYT48L2xpPicgK1xuICAgICAgICAnPC91bD48L25hdj4nKTtcbn1dKTtcblxuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXG4gICAgLmNvbnRyb2xsZXIoJ3N0VGFibGVDb250cm9sbGVyJywgWyckc2NvcGUnLCAnJHBhcnNlJywgJyRmaWx0ZXInLCAnJGF0dHJzJywgZnVuY3Rpb24gU3RUYWJsZUNvbnRyb2xsZXIoJHNjb3BlLCAkcGFyc2UsICRmaWx0ZXIsICRhdHRycykge1xuICAgICAgICB2YXIgcHJvcGVydHlOYW1lID0gJGF0dHJzLnN0VGFibGU7XG4gICAgICAgIHZhciBkaXNwbGF5R2V0dGVyID0gJHBhcnNlKHByb3BlcnR5TmFtZSk7XG4gICAgICAgIHZhciBkaXNwbGF5U2V0dGVyID0gZGlzcGxheUdldHRlci5hc3NpZ247XG4gICAgICAgIHZhciBzYWZlR2V0dGVyO1xuICAgICAgICB2YXIgb3JkZXJCeSA9ICRmaWx0ZXIoJ29yZGVyQnknKTtcbiAgICAgICAgdmFyIGZpbHRlciA9ICRmaWx0ZXIoJ2ZpbHRlcicpO1xuICAgICAgICB2YXIgc2FmZUNvcHkgPSBjb3B5UmVmcyhkaXNwbGF5R2V0dGVyKCRzY29wZSkpO1xuICAgICAgICB2YXIgdGFibGVTdGF0ZSA9IHtcbiAgICAgICAgICAgIHNvcnQ6IHt9LFxuICAgICAgICAgICAgZmlsdGVyczoge30sXG4gICAgICAgICAgICBwYWdpbmF0aW9uOiB7XG4gICAgICAgICAgICAgICAgc3RhcnQ6IDBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdmFyIHBpcGVBZnRlclNhZmVDb3B5ID0gdHJ1ZTtcbiAgICAgICAgdmFyIGN0cmwgPSB0aGlzO1xuICAgICAgICB2YXIgbGFzdFNlbGVjdGVkO1xuXG5cblxuICAgICAgICAvKipcbiAgICAgICAgICogc29ydCB0aGUgcm93c1xuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9uIHwgU3RyaW5nfSBwcmVkaWNhdGUgLSBmdW5jdGlvbiBvciBzdHJpbmcgd2hpY2ggd2lsbCBiZSB1c2VkIGFzIHByZWRpY2F0ZSBmb3IgdGhlIHNvcnRpbmdcbiAgICAgICAgICogQHBhcmFtIFtyZXZlcnNlXSAtIGlmIHlvdSB3YW50IHRvIHJldmVyc2UgdGhlIG9yZGVyXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnNvcnRCeSA9IGZ1bmN0aW9uIHNvcnRCeShwcmVkaWNhdGUsIHJldmVyc2UpIHtcbiAgICAgICAgICAgIHRhYmxlU3RhdGUuc29ydC5wcmVkaWNhdGUgPSBwcmVkaWNhdGU7XG4gICAgICAgICAgICB0YWJsZVN0YXRlLnNvcnQucmV2ZXJzZSA9IHJldmVyc2UgPT09IHRydWU7XG5cbiAgICAgICAgICAgIGlmIChuZy5pc0Z1bmN0aW9uKHByZWRpY2F0ZSkpIHtcbiAgICAgICAgICAgICAgdGFibGVTdGF0ZS5zb3J0LmZ1bmN0aW9uTmFtZSA9IHByZWRpY2F0ZS5uYW1lO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZGVsZXRlIHRhYmxlU3RhdGUuc29ydC5mdW5jdGlvbk5hbWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRhYmxlU3RhdGUucGFnaW5hdGlvbi5zdGFydCA9IDA7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5waXBlKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJlZ2lzdGVyIGEgZmlsdGVyXG4gICAgICAgICAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIC0gbmFtZSBvZiBmaWx0ZXJcbiAgICAgICAgICogQHBhcmFtIHtmdW5jdGlvbihhY3R1YWwsIGV4cGVjdGVkKXx0cnVlfHVuZGVmaW5lZH0gY29tcGFyYXRvciBDb21wYXJhdG9yIHdoaWNoIGlzIHVzZWQgaW4gZGV0ZXJtaW5pbmcgaWYgdGhlXG4gICAgICAgICAqICAgICBleHBlY3RlZCB2YWx1ZSAoZnJvbSB0aGUgZmlsdGVyIGV4cHJlc3Npb24pIGFuZCBhY3R1YWwgdmFsdWUgKGZyb20gdGhlIG9iamVjdCBpbiB0aGUgYXJyYXkpIHNob3VsZCBiZVxuICAgICAgICAgKiAgICAgY29uc2lkZXJlZCBhIG1hdGNoLiBTZWUgYWxzbyBodHRwczovL2RvY3MuYW5ndWxhcmpzLm9yZy9hcGkvbmcvZmlsdGVyL2ZpbHRlci5cbiAgICAgICAgICogQHBhcmFtIHtTdHJpbmd8dW5kZWZpbmVkfSBlbXB0eVZhbHVlIFZhbHVlIHRoYXQgcmVwcmVzZW50cyBhICdubyBmaWx0ZXInIHZhbHVlLlxuICAgICAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSAtIGZpbHRlciBvYmplY3Qgd2l0aCBwcmVkaWNhdGVPYmplY3QgYW5kIGNvbXBhcmF0b3IuXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnJlZ2lzdGVyRmlsdGVyID0gZnVuY3Rpb24obmFtZSwgY29tcGFyYXRvciwgZW1wdHlWYWx1ZSkge1xuICAgICAgICAgICAgaWYgKHRhYmxlU3RhdGUuZmlsdGVycz09PXVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRhYmxlU3RhdGUuZmlsdGVycyA9IHt9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGZpbHRlciA9IHRhYmxlU3RhdGUuZmlsdGVyc1tuYW1lXTtcbiAgICAgICAgICAgIGlmIChmaWx0ZXI9PT11bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXIgPSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbXBhcmF0b3I6IGNvbXBhcmF0b3IsXG4gICAgICAgICAgICAgICAgICAgIHByZWRpY2F0ZU9iamVjdDoge30sXG4gICAgICAgICAgICAgICAgICAgIGVtcHR5VmFsdWU6IChlbXB0eVZhbHVlIT09dW5kZWZpbmVkID8gZW1wdHlWYWx1ZSA6ICcnKVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgdGFibGVTdGF0ZS5maWx0ZXJzW25hbWVdID0gZmlsdGVyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZpbHRlcjtcbiAgICAgICAgfTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogc2VhcmNoIG1hdGNoaW5nIHJvd3NcbiAgICAgICAgICogQGRlcHJlY2F0ZWQgdGhpcyBtZXRob2QgaXMgb25seSBtZWFudCBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuXG4gICAgICAgICAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCAtIHRoZSBpbnB1dCBzdHJpbmdcbiAgICAgICAgICogQHBhcmFtIHtTdHJpbmd9IFtwcmVkaWNhdGVdIC0gdGhlIHByb3BlcnR5IG5hbWUgYWdhaW5zdCB5b3Ugd2FudCB0byBjaGVjayB0aGUgbWF0Y2gsIG90aGVyd2lzZSBpdCB3aWxsIHNlYXJjaCBvbiBhbGwgcHJvcGVydGllc1xuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5zZWFyY2ggPSBmdW5jdGlvbiBzZWFyY2goaW5wdXQsIHByZWRpY2F0ZSkge1xuICAgICAgICAgICAgdmFyIHNlYXJjaEZpbHRlciA9IHRoaXMucmVnaXN0ZXJGaWx0ZXIoJ3NlYXJjaCcpOyAvLyBtYWtlIHN1cmUgJ3NlYXJjaCcgZmlsdGVyIGV4aXN0cywgZ2V0IGNvcHkgaWYgYWxyZWFkeSByZWdpc3RlcmVkLlxuICAgICAgICAgICAgdGhpcy5hcHBseUZpbHRlcihpbnB1dCwgcHJlZGljYXRlLCBzZWFyY2hGaWx0ZXIpO1xuICAgICAgICB9O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBhcHBseSBmaWx0ZXIgdG8gcm93IGRhdGFcbiAgICAgICAgICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IC0gdGhlIGlucHV0IHN0cmluZ1xuICAgICAgICAgKiBAcGFyYW0ge1N0cmluZ30gcHJlZGljYXRlIC0gdGhlIHByb3BlcnR5IG5hbWUgYWdhaW5zdCB5b3Ugd2FudCB0byBjaGVjayB0aGUgbWF0Y2gsIG90aGVyd2lzZSBpdCB3aWxsIHNlYXJjaCBvbiBhbGwgcHJvcGVydGllc1xuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gZmlsdGVyIC0gdGhlIGZpbHRlciB0aGF0IGlzIGdvaW5nIHRvIGJlIGFwcGxpZWRcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuYXBwbHlGaWx0ZXIgPSBmdW5jdGlvbihpbnB1dCwgcHJlZGljYXRlLCBmaWx0ZXIpIHtcbiAgICAgICAgICAgIHZhciBwcm9wID0gcHJlZGljYXRlIHx8ICckJztcbiAgICAgICAgICAgIGZpbHRlci5wcmVkaWNhdGVPYmplY3RbcHJvcF0gPSBpbnB1dDtcbiAgICAgICAgICAgIC8vIHRvIGF2b2lkIHRvIGZpbHRlciBvdXQgbnVsbCB2YWx1ZVxuICAgICAgICAgICAgaWYgKGlucHV0PT09ZmlsdGVyLmVtcHR5VmFsdWUpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgZmlsdGVyLnByZWRpY2F0ZU9iamVjdFtwcm9wXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRhYmxlU3RhdGUucGFnaW5hdGlvbi5zdGFydCA9IDA7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5waXBlKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIHRoaXMgd2lsbCBjaGFpbiB0aGUgb3BlcmF0aW9ucyBvZiBzb3J0aW5nIGFuZCBmaWx0ZXJpbmcgYmFzZWQgb24gdGhlIGN1cnJlbnQgdGFibGUgc3RhdGUgKHNvcnQgb3B0aW9ucywgZmlsdGVyaW5nLCBlY3QpXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnBpcGUgPSBmdW5jdGlvbiBwaXBlKCkge1xuICAgICAgICAgICAgdmFyIHBhZ2luYXRpb24gPSB0YWJsZVN0YXRlLnBhZ2luYXRpb247XG5cbiAgICAgICAgICAgIHZhciBmaWx0ZXJlZCA9IHNhZmVDb3B5O1xuICAgICAgICAgICAgYW5ndWxhci5mb3JFYWNoKHRhYmxlU3RhdGUuZmlsdGVycywgZnVuY3Rpb24oZmlsdGVyT2JqKSB7XG4gICAgICAgICAgICAgICAgdmFyIHByZWRpY2F0ZU9iamVjdCA9IGZpbHRlck9iai5wcmVkaWNhdGVPYmplY3Q7XG4gICAgICAgICAgICAgICAgaWYgKE9iamVjdC5rZXlzKHByZWRpY2F0ZU9iamVjdCkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJlZCA9IGZpbHRlcihmaWx0ZXJlZCwgcHJlZGljYXRlT2JqZWN0LCBmaWx0ZXJPYmouY29tcGFyYXRvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGlmICh0YWJsZVN0YXRlLnNvcnQucHJlZGljYXRlKSB7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWQgPSBvcmRlckJ5KGZpbHRlcmVkLCB0YWJsZVN0YXRlLnNvcnQucHJlZGljYXRlLCB0YWJsZVN0YXRlLnNvcnQucmV2ZXJzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocGFnaW5hdGlvbi5udW1iZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHBhZ2luYXRpb24ubnVtYmVyT2ZQYWdlcyA9IGZpbHRlcmVkLmxlbmd0aCA+IDAgPyBNYXRoLmNlaWwoZmlsdGVyZWQubGVuZ3RoIC8gcGFnaW5hdGlvbi5udW1iZXIpIDogMTtcbiAgICAgICAgICAgICAgICBwYWdpbmF0aW9uLnN0YXJ0ID0gcGFnaW5hdGlvbi5zdGFydCA+PSBmaWx0ZXJlZC5sZW5ndGggPyAocGFnaW5hdGlvbi5udW1iZXJPZlBhZ2VzIC0gMSkgKiBwYWdpbmF0aW9uLm51bWJlciA6IHBhZ2luYXRpb24uc3RhcnQ7XG4gICAgICAgICAgICAgICAgZmlsdGVyZWQgPSBmaWx0ZXJlZC5zbGljZShwYWdpbmF0aW9uLnN0YXJ0LCBwYWdpbmF0aW9uLnN0YXJ0ICsgcGFyc2VJbnQocGFnaW5hdGlvbi5udW1iZXIpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRpc3BsYXlTZXR0ZXIoJHNjb3BlLCBmaWx0ZXJlZCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIHNlbGVjdCBhIGRhdGFSb3cgKGl0IHdpbGwgYWRkIHRoZSBhdHRyaWJ1dGUgaXNTZWxlY3RlZCB0byB0aGUgcm93IG9iamVjdClcbiAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IHJvdyAtIHRoZSByb3cgdG8gc2VsZWN0XG4gICAgICAgICAqIEBwYXJhbSB7U3RyaW5nfSBbbW9kZV0gLSBcInNpbmdsZVwiIG9yIFwibXVsdGlwbGVcIiAobXVsdGlwbGUgYnkgZGVmYXVsdClcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuc2VsZWN0ID0gZnVuY3Rpb24gc2VsZWN0KHJvdywgbW9kZSkge1xuICAgICAgICAgICAgdmFyIHJvd3MgPSBzYWZlQ29weTtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IHJvd3MuaW5kZXhPZihyb3cpO1xuICAgICAgICAgICAgaWYgKGluZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIGlmIChtb2RlID09PSAnc2luZ2xlJykge1xuICAgICAgICAgICAgICAgICAgICByb3cuaXNTZWxlY3RlZCA9IHJvdy5pc1NlbGVjdGVkICE9PSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBpZiAobGFzdFNlbGVjdGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsYXN0U2VsZWN0ZWQuaXNTZWxlY3RlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGxhc3RTZWxlY3RlZCA9IHJvdy5pc1NlbGVjdGVkID09PSB0cnVlID8gcm93IDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJvd3NbaW5kZXhdLmlzU2VsZWN0ZWQgPSAhcm93c1tpbmRleF0uaXNTZWxlY3RlZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIHRha2UgYSBzbGljZSBvZiB0aGUgY3VycmVudCBzb3J0ZWQvZmlsdGVyZWQgY29sbGVjdGlvbiAocGFnaW5hdGlvbilcbiAgICAgICAgICpcbiAgICAgICAgICogQHBhcmFtIHtOdW1iZXJ9IHN0YXJ0IC0gc3RhcnQgaW5kZXggb2YgdGhlIHNsaWNlXG4gICAgICAgICAqIEBwYXJhbSB7TnVtYmVyfSBudW1iZXIgLSB0aGUgbnVtYmVyIG9mIGl0ZW0gaW4gdGhlIHNsaWNlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnNsaWNlID0gZnVuY3Rpb24gc3BsaWNlKHN0YXJ0LCBudW1iZXIpIHtcbiAgICAgICAgICAgIHRhYmxlU3RhdGUucGFnaW5hdGlvbi5zdGFydCA9IHN0YXJ0O1xuICAgICAgICAgICAgdGFibGVTdGF0ZS5wYWdpbmF0aW9uLm51bWJlciA9IG51bWJlcjtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBpcGUoKTtcbiAgICAgICAgfTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogcmV0dXJuIHRoZSBjdXJyZW50IHN0YXRlIG9mIHRoZSB0YWJsZVxuICAgICAgICAgKiBAcmV0dXJucyB7e3NvcnQ6IHt9LCBzZWFyY2g6IHt9LCBmaWx0ZXJzOiB7fSwgcGFnaW5hdGlvbjoge3N0YXJ0OiBudW1iZXJ9fX1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMudGFibGVTdGF0ZSA9IGZ1bmN0aW9uIGdldFRhYmxlU3RhdGUoKSB7XG5cbiAgICAgICAgICAgIC8vIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSwgbWFrZSBzdXJlIHRhYmxlU3RhdGUuc2VhcmNoIGV4aXN0cy5cbiAgICAgICAgICAgIHRhYmxlU3RhdGUuc2VhcmNoID0gdGFibGVTdGF0ZS5maWx0ZXJzLnNlYXJjaCA/IHRhYmxlU3RhdGUuZmlsdGVycy5zZWFyY2ggOiB7fTtcblxuICAgICAgICAgICAgcmV0dXJuIHRhYmxlU3RhdGU7XG4gICAgICAgIH07XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFVzZSBhIGRpZmZlcmVudCBmaWx0ZXIgZnVuY3Rpb24gdGhhbiB0aGUgYW5ndWxhciBGaWx0ZXJGaWx0ZXJcbiAgICAgICAgICogQHBhcmFtIGZpbHRlck5hbWUgdGhlIG5hbWUgdW5kZXIgd2hpY2ggdGhlIGN1c3RvbSBmaWx0ZXIgaXMgcmVnaXN0ZXJlZFxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5zZXRGaWx0ZXJGdW5jdGlvbiA9IGZ1bmN0aW9uIHNldEZpbHRlckZ1bmN0aW9uKGZpbHRlck5hbWUpIHtcbiAgICAgICAgICAgIGZpbHRlciA9ICRmaWx0ZXIoZmlsdGVyTmFtZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqVXNlciBhIGRpZmZlcmVudCBmdW5jdGlvbiB0aGFuIHRoZSBhbmd1bGFyIG9yZGVyQnlcbiAgICAgICAgICogQHBhcmFtIHNvcnRGdW5jdGlvbk5hbWUgdGhlIG5hbWUgdW5kZXIgd2hpY2ggdGhlIGN1c3RvbSBvcmRlciBmdW5jdGlvbiBpcyByZWdpc3RlcmVkXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnNldFNvcnRGdW5jdGlvbiA9IGZ1bmN0aW9uIHNldFNvcnRGdW5jdGlvbihzb3J0RnVuY3Rpb25OYW1lKSB7XG4gICAgICAgICAgICBvcmRlckJ5ID0gJGZpbHRlcihzb3J0RnVuY3Rpb25OYW1lKTtcbiAgICAgICAgfTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVXN1YWxseSB3aGVuIHRoZSBzYWZlIGNvcHkgaXMgdXBkYXRlZCB0aGUgcGlwZSBmdW5jdGlvbiBpcyBjYWxsZWQuXG4gICAgICAgICAqIENhbGxpbmcgdGhpcyBtZXRob2Qgd2lsbCBwcmV2ZW50IGl0LCB3aGljaCBpcyBzb21ldGhpbmcgcmVxdWlyZWQgd2hlbiB1c2luZyBhIGN1c3RvbSBwaXBlIGZ1bmN0aW9uXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnByZXZlbnRQaXBlT25XYXRjaCA9IGZ1bmN0aW9uIHByZXZlbnRQaXBlKCkge1xuICAgICAgICAgICAgcGlwZUFmdGVyU2FmZUNvcHkgPSBmYWxzZTtcbiAgICAgICAgfTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQ29udmVuaWVudCBtZXRob2QgdG8gZGV0ZXJtaW5lIHRoZSB1bmlxdWUgdmFsdWVzIGZvciBhIGdpdmVuIHByZWRpY2F0ZS5cbiAgICAgICAgICogVGhpcyBtZXRob2QgaXMgdXNlZCBpbiBzdFNlbGVjdEZpbHRlciB0byBkZXRlcm1pbmUgdGhlIG9wdGlvbnMgZm9yIHRoZSBzZWxlY3QgZWxlbWVudC5cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZ2V0VW5pcXVlVmFsdWVzID0gZnVuY3Rpb24ocHJlZGljYXRlKSB7XG4gICAgICAgICAgICB2YXIgc2VlbjtcbiAgICAgICAgICAgIHZhciBnZXR0ZXIgPSAkcGFyc2UocHJlZGljYXRlKTtcbiAgICAgICAgICAgIHJldHVybiBzYWZlQ29weVxuICAgICAgICAgICAgICAgIC5tYXAoZnVuY3Rpb24oZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdldHRlcihlbCk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuc29ydCgpXG4gICAgICAgICAgICAgICAgLmZpbHRlcihmdW5jdGlvbihlbCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc2VlbiA9PT0gdW5kZWZpbmVkIHx8IHNlZW4gIT09IGVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWVuID0gZWw7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cblxuXG4gICAgICAgIC8vIFRoZSBjb25zdHJ1Y3RvciBsb2dpYyBpcyBtb3ZlZCBkb3duIHRvIGFwcGVhciB1bmRlciB0aGUgZGVmaW5pdGlvbnMgb2YgdGhlIG1lbWJlciBmdW5jdGlvbnMuIFRoaXMgdG8gbWFrZVxuICAgICAgICAvLyBzdXJlIHRoZSBwaXBlIGZ1bmN0aW9uIGlzIGRlZmluZWQgYmVmb3JlIHdlIGF0dGVtcHQgdG8gY2FsbCBpdC5cblxuICAgICAgICBmdW5jdGlvbiBjb3B5UmVmcyhzcmMpIHtcbiAgICAgICAgICAgIHJldHVybiBzcmMgPyBbXS5jb25jYXQoc3JjKSA6IFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gdXBkYXRlU2FmZUNvcHkoKSB7XG4gICAgICAgICAgICBzYWZlQ29weSA9IGNvcHlSZWZzKHNhZmVHZXR0ZXIoJHNjb3BlKSk7XG4gICAgICAgICAgICBpZiAocGlwZUFmdGVyU2FmZUNvcHkgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICBjdHJsLnBpcGUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgkYXR0cnMuc3RTYWZlU3JjKSB7XG4gICAgICAgICAgICBzYWZlR2V0dGVyID0gJHBhcnNlKCRhdHRycy5zdFNhZmVTcmMpO1xuXG4gICAgICAgICAgICAkc2NvcGUuJHdhdGNoR3JvdXAoW2Z1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHZhciBzYWZlU3JjID0gc2FmZUdldHRlcigkc2NvcGUpO1xuICAgICAgICAgICAgICAgIHJldHVybiBzYWZlU3JjID8gc2FmZVNyYy5sZW5ndGggOiAwO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNhZmVHZXR0ZXIoJHNjb3BlKTtcbiAgICAgICAgICAgIH1dLCBmdW5jdGlvbihuZXdWYWx1ZXMsIG9sZFZhbHVlcykge1xuICAgICAgICAgICAgICAgIGlmIChvbGRWYWx1ZXNbMF0gIT09IG5ld1ZhbHVlc1swXSB8fCBvbGRWYWx1ZXNbMV0gIT09IG5ld1ZhbHVlc1sxXSkge1xuICAgICAgICAgICAgICAgICAgICB1cGRhdGVTYWZlQ29weSgpO1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUuJGJyb2FkY2FzdCgnc3Qtc2FmZVNyY0NoYW5nZWQnLCBudWxsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gbWFrZSBzdXJlIHRoYXQgc3RUYWJsZSBpcyBkZWZpbmVkIG9uICRzY29wZS4gRWl0aGVyIGltcGxpY2l0bHkgYnkgY2FsbGluZyB1cGRhdGVTYWZlQ29weSBvciBleHBsaWNpdGx5LlxuICAgICAgICAgICAgLy8gYnkgY2FsbGluZyBkaXNwbGF5U2V0dGVyLlxuICAgICAgICAgICAgdXBkYXRlU2FmZUNvcHkoKTtcbiAgICAgICAgICAgIGlmIChwaXBlQWZ0ZXJTYWZlQ29weSAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIGRpc3BsYXlTZXR0ZXIoJHNjb3BlLCBzYWZlQ29weSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XSlcbiAgICAuZGlyZWN0aXZlKCdzdFRhYmxlJywgZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmVzdHJpY3Q6ICdBJyxcbiAgICAgICAgICAgIGNvbnRyb2xsZXI6ICdzdFRhYmxlQ29udHJvbGxlcicsXG4gICAgICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcblxuICAgICAgICAgICAgICAgIGlmIChhdHRyLnN0U2V0RmlsdGVyKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0cmwuc2V0RmlsdGVyRnVuY3Rpb24oYXR0ci5zdFNldEZpbHRlcik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGF0dHIuc3RTZXRTb3J0KSB7XG4gICAgICAgICAgICAgICAgICAgIGN0cmwuc2V0U29ydEZ1bmN0aW9uKGF0dHIuc3RTZXRTb3J0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfSk7XG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcbiAgICAuZGlyZWN0aXZlKCdzdFNlYXJjaCcsIFsnJHRpbWVvdXQnLCBmdW5jdGlvbiAoJHRpbWVvdXQpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlcXVpcmU6ICdec3RUYWJsZScsXG4gICAgICAgICAgICBzY29wZToge1xuICAgICAgICAgICAgICAgIHByZWRpY2F0ZTogJz0/c3RTZWFyY2gnXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRyLCBjdHJsKSB7XG4gICAgICAgICAgICAgICAgdmFyIHRhYmxlQ3RybCA9IGN0cmw7XG4gICAgICAgICAgICAgICAgdmFyIHByb21pc2UgPSBudWxsO1xuICAgICAgICAgICAgICAgIHZhciB0aHJvdHRsZSA9IGF0dHIuc3REZWxheSB8fCA0MDA7XG4gICAgICAgICAgICAgICAgdmFyIGZpbHRlciA9IGN0cmwucmVnaXN0ZXJGaWx0ZXIoJ3NlYXJjaCcpO1xuXG4gICAgICAgICAgICAgICAgc2NvcGUuJHdhdGNoKCdwcmVkaWNhdGUnLCBmdW5jdGlvbiAobmV3VmFsdWUsIG9sZFZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChuZXdWYWx1ZSAhPT0gb2xkVmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBmaWx0ZXIucHJlZGljYXRlT2JqZWN0W29sZFZhbHVlXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhYmxlQ3RybC5hcHBseUZpbHRlcihlbGVtZW50WzBdLnZhbHVlLCBuZXdWYWx1ZSwgZmlsdGVyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgLy90YWJsZSBzdGF0ZSAtPiB2aWV3XG4gICAgICAgICAgICAgICAgc2NvcGUuJHdhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZpbHRlci5wcmVkaWNhdGVPYmplY3Q7XG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKG5ld1ZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwcmVkaWNhdGVPYmplY3QgPSBuZXdWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHByZWRpY2F0ZUV4cHJlc3Npb24gPSBzY29wZS5wcmVkaWNhdGUgfHwgJyQnO1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJlZGljYXRlT2JqZWN0ICYmIHByZWRpY2F0ZU9iamVjdFtwcmVkaWNhdGVFeHByZXNzaW9uXSAhPT0gZWxlbWVudFswXS52YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudFswXS52YWx1ZSA9IHByZWRpY2F0ZU9iamVjdFtwcmVkaWNhdGVFeHByZXNzaW9uXSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgICAgICAgICAgLy8gdmlldyAtPiB0YWJsZSBzdGF0ZVxuICAgICAgICAgICAgICAgIGVsZW1lbnQuYmluZCgnaW5wdXQnLCBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGV2dCA9IGV2dC5vcmlnaW5hbEV2ZW50IHx8IGV2dDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb21pc2UgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICR0aW1lb3V0LmNhbmNlbChwcm9taXNlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBwcm9taXNlID0gJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFibGVDdHJsLmFwcGx5RmlsdGVyKGV2dC50YXJnZXQudmFsdWUsIHNjb3BlLnByZWRpY2F0ZSwgZmlsdGVyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb21pc2UgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICB9LCB0aHJvdHRsZSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfV0pO1xuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXG4gICAgLmRpcmVjdGl2ZSgnc3RTZWxlY3RGaWx0ZXInLCBbJyRpbnRlcnBvbGF0ZScsIGZ1bmN0aW9uICgkaW50ZXJwb2xhdGUpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlcGxhY2U6IHRydWUsXG4gICAgICAgICAgICByZXF1aXJlOiAnXnN0VGFibGUnLFxuICAgICAgICAgICAgc2NvcGU6IHtcbiAgICAgICAgICAgICAgICBwcmVkaWNhdGU6ICc9P3N0U2VsZWN0RmlsdGVyJyxcbiAgICAgICAgICAgICAgICBhdHRyT3B0aW9uczogJz0/b3B0aW9ucycsXG4gICAgICAgICAgICAgICAgc2VsZWN0ZWQ6ICc9P3ZhbHVlJyxcbiAgICAgICAgICAgICAgICBjb21wYXJhdG9yOiAnJidcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHRlbXBsYXRlOiBmdW5jdGlvbih0RWxlbWVudCwgdEF0dHJzKSB7XG4gICAgICAgICAgICAgICAgdmFyIGVtcHR5TGFiZWwgPSB0QXR0cnMuZW1wdHlMYWJlbCA/IHRBdHRycy5lbXB0eUxhYmVsIDogJyc7XG4gICAgICAgICAgICAgICAgcmV0dXJuICc8c2VsZWN0IGRhdGEtbmctbW9kZWw9XCJzZWxlY3RlZFwiIGRhdGEtbmctb3B0aW9ucz1cIm9wdGlvbi52YWx1ZSBhcyBvcHRpb24ubGFiZWwgZm9yIG9wdGlvbiBpbiBvcHRpb25zXCI+JyArXG4gICAgICAgICAgICAgICAgICAgICAgICc8b3B0aW9uIHZhbHVlPVwiXCI+JyArIGVtcHR5TGFiZWwgKyAnPC9vcHRpb24+PC9zZWxlY3Q+JztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcbiAgICAgICAgICAgICAgICB2YXIgdGFibGVDdHJsID0gY3RybDtcbiAgICAgICAgICAgICAgICB2YXIgZmlsdGVyO1xuICAgICAgICAgICAgICAgIHZhciBGSUxURVJfTkFNRSA9ICdzZWxlY3RGaWx0ZXInO1xuXG4gICAgICAgICAgICAgICAgaWYgKGF0dHIuaGFzT3duUHJvcGVydHkoJ2NvbXBhcmF0b3InKSkge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIFdlIGhhdmUgdG8gdXNlIGEgZ2V0dGVyIHRvIGdldCB0aGUgYWN0dWFsIGZ1bmN0aW9uPyFcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNvbXBhcmF0b3IgPSBzY29wZS5jb21wYXJhdG9yKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQ3VzdG9tIGZpbHRlciBuYW1lIGZvciBjb21wYXJhdG9yLCBzdGFuZGFyZCBuYW1lIHBsdXMgbmFtZSBvZiBjb21wYXJhdG9yIGZ1bmN0aW9uLlxuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIHdheSB3ZSBwcmV2ZW50IG1ha2luZyBtdWx0aXBsZSBmaWx0ZXJzIGZvciB0aGUgc2FtZSBjb21wYXJhdG9yLlxuICAgICAgICAgICAgICAgICAgICB2YXIgY3VzdG9tRmlsdGVyTmFtZSA9IEZJTFRFUl9OQU1FICsgJ18nICsgY29tcGFyYXRvci5uYW1lO1xuXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlciA9IGN0cmwucmVnaXN0ZXJGaWx0ZXIoY3VzdG9tRmlsdGVyTmFtZSAsIGNvbXBhcmF0b3IsIG51bGwpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgICAgICAgICAvLyBkZWZhdWx0IHdlIHVzZSBzdHJpY3QgY29tcGFyaXNvblxuICAgICAgICAgICAgICAgICAgIGZpbHRlciA9IGN0cmwucmVnaXN0ZXJGaWx0ZXIoRklMVEVSX05BTUUsIHRydWUsIG51bGwpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChzY29wZS5hdHRyT3B0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc2NvcGUuYXR0ck9wdGlvbnMubGVuZ3RoPjAgJiYgKHR5cGVvZiBzY29wZS5hdHRyT3B0aW9uc1swXSA9PT0gJ29iamVjdCcpKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9wdGlvbnMgYXMgYXJyYXkgb2Ygb2JqZWN0cywgZWc6IFt7bGFiZWw6J2dyZWVuJywgdmFsdWU6dHJ1ZX0sIHtsYWJlbDoncmVkJywgdmFsdWU6ZmFsc2V9XVxuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUub3B0aW9ucyA9IHNjb3BlLmF0dHJPcHRpb25zLnNsaWNlKDApOyAvLyBjb3B5IHZhbHVlc1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBvcHRpb25zIGFzIHNpbXBsZSBhcnJheSwgZWc6IFsnYXBwbGUnLCAnYmFuYW5hJywgJ2NoZXJyeScsICdzdHJhd2JlcnJ5JywgJ21hbmdvJywgJ3BpbmVhcHBsZSddO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUub3B0aW9ucyA9IGdldE9wdGlvbk9iamVjdHNGcm9tQXJyYXkoc2NvcGUuYXR0ck9wdGlvbnMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyBpZiBub3QgZXhwbGljaXRseSBwYXNzZWQgdGhlbiBkZXRlcm1pbmUgdGhlIG9wdGlvbnMgYnkgbG9va2luZyBhdCB0aGUgY29udGVudCBvZiB0aGUgdGFibGUuXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLm9wdGlvbnMgPSBnZXRPcHRpb25PYmplY3RzRnJvbUFycmF5KGN0cmwuZ2V0VW5pcXVlVmFsdWVzKHNjb3BlLnByZWRpY2F0ZSkpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIHdoZW4gdGhlIHRhYmxlIGRhdGEgaXMgdXBkYXRlZCwgYWxzbyB1cGRhdGUgdGhlIG9wdGlvbnNcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUuJG9uKCdzdC1zYWZlU3JjQ2hhbmdlZCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUub3B0aW9ucyA9IGdldE9wdGlvbk9iamVjdHNGcm9tQXJyYXkoY3RybC5nZXRVbmlxdWVWYWx1ZXMoc2NvcGUucHJlZGljYXRlKSk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGlmIGEgbGFiZWwgZXhwcmVzc2lvbiBpcyBwYXNzZWQgdGhhbiB1c2UgdGhpcyB0byBjcmVhdGUgY3VzdG9tIGxhYmVscy5cbiAgICAgICAgICAgICAgICBpZiAoYXR0ci5sYWJlbCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3RyVGVtcGxhdGUgPSBhdHRyLmxhYmVsLnJlcGxhY2UoJ1tbJywgJ3t7JykucmVwbGFjZSgnXV0nLCAnfX0nKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRlbXBsYXRlID0gJGludGVycG9sYXRlKHN0clRlbXBsYXRlKTtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUub3B0aW9ucy5mb3JFYWNoKGZ1bmN0aW9uKG9wdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9uLmxhYmVsID0gdGVtcGxhdGUob3B0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZWxlbWVudC5vbignY2hhbmdlJywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhYmxlQ3RybC5hcHBseUZpbHRlcihzY29wZS5zZWxlY3RlZCwgc2NvcGUucHJlZGljYXRlLCBmaWx0ZXIpO1xuICAgICAgICAgICAgICAgICAgICBzY29wZS4kcGFyZW50LiRkaWdlc3QoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9XSk7XG5cbmZ1bmN0aW9uIGdldE9wdGlvbk9iamVjdHNGcm9tQXJyYXkob3B0aW9ucykge1xuICAgIHJldHVybiBvcHRpb25zLm1hcChmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgcmV0dXJuIHtsYWJlbDogdmFsLCB2YWx1ZTogdmFsfTtcbiAgICB9KTtcbn1cblxuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXG4gIC5kaXJlY3RpdmUoJ3N0U2VsZWN0Um93JywgZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB7XG4gICAgICByZXN0cmljdDogJ0EnLFxuICAgICAgcmVxdWlyZTogJ15zdFRhYmxlJyxcbiAgICAgIHNjb3BlOiB7XG4gICAgICAgIHJvdzogJz1zdFNlbGVjdFJvdydcbiAgICAgIH0sXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcbiAgICAgICAgdmFyIG1vZGUgPSBhdHRyLnN0U2VsZWN0TW9kZSB8fCAnc2luZ2xlJztcbiAgICAgICAgZWxlbWVudC5iaW5kKCdjbGljaycsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBzY29wZS4kYXBwbHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgY3RybC5zZWxlY3Qoc2NvcGUucm93LCBtb2RlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoKCdyb3cuaXNTZWxlY3RlZCcsIGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgIGlmIChuZXdWYWx1ZSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgZWxlbWVudC5hZGRDbGFzcygnc3Qtc2VsZWN0ZWQnKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZWxlbWVudC5yZW1vdmVDbGFzcygnc3Qtc2VsZWN0ZWQnKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH07XG4gIH0pO1xuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXG4gIC5kaXJlY3RpdmUoJ3N0U29ydCcsIFsnJHBhcnNlJywgZnVuY3Rpb24gKCRwYXJzZSkge1xuICAgIHJldHVybiB7XG4gICAgICByZXN0cmljdDogJ0EnLFxuICAgICAgcmVxdWlyZTogJ15zdFRhYmxlJyxcbiAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0ciwgY3RybCkge1xuXG4gICAgICAgIHZhciBwcmVkaWNhdGUgPSBhdHRyLnN0U29ydDtcbiAgICAgICAgdmFyIGdldHRlciA9ICRwYXJzZShwcmVkaWNhdGUpO1xuICAgICAgICB2YXIgaW5kZXggPSAwO1xuICAgICAgICB2YXIgY2xhc3NBc2NlbnQgPSBhdHRyLnN0Q2xhc3NBc2NlbnQgfHwgJ3N0LXNvcnQtYXNjZW50JztcbiAgICAgICAgdmFyIGNsYXNzRGVzY2VudCA9IGF0dHIuc3RDbGFzc0Rlc2NlbnQgfHwgJ3N0LXNvcnQtZGVzY2VudCc7XG4gICAgICAgIHZhciBzdGF0ZUNsYXNzZXMgPSBbY2xhc3NBc2NlbnQsIGNsYXNzRGVzY2VudF07XG4gICAgICAgIHZhciBzb3J0RGVmYXVsdDtcblxuICAgICAgICBpZiAoYXR0ci5zdFNvcnREZWZhdWx0KSB7XG4gICAgICAgICAgc29ydERlZmF1bHQgPSBzY29wZS4kZXZhbChhdHRyLnN0U29ydERlZmF1bHQpICE9PSB1bmRlZmluZWQgPyAgc2NvcGUuJGV2YWwoYXR0ci5zdFNvcnREZWZhdWx0KSA6IGF0dHIuc3RTb3J0RGVmYXVsdDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vdmlldyAtLT4gdGFibGUgc3RhdGVcbiAgICAgICAgZnVuY3Rpb24gc29ydCgpIHtcbiAgICAgICAgICBpbmRleCsrO1xuICAgICAgICAgIHByZWRpY2F0ZSA9IG5nLmlzRnVuY3Rpb24oZ2V0dGVyKHNjb3BlKSkgPyBnZXR0ZXIoc2NvcGUpIDogYXR0ci5zdFNvcnQ7XG4gICAgICAgICAgaWYgKGluZGV4ICUgMyA9PT0gMCAmJiBhdHRyLnN0U2tpcE5hdHVyYWwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgLy9tYW51YWwgcmVzZXRcbiAgICAgICAgICAgIGluZGV4ID0gMDtcbiAgICAgICAgICAgIGN0cmwudGFibGVTdGF0ZSgpLnNvcnQgPSB7fTtcbiAgICAgICAgICAgIGN0cmwudGFibGVTdGF0ZSgpLnBhZ2luYXRpb24uc3RhcnQgPSAwO1xuICAgICAgICAgICAgY3RybC5waXBlKCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGN0cmwuc29ydEJ5KHByZWRpY2F0ZSwgaW5kZXggJSAyID09PSAwKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBlbGVtZW50LmJpbmQoJ2NsaWNrJywgZnVuY3Rpb24gc29ydENsaWNrKCkge1xuICAgICAgICAgIGlmIChwcmVkaWNhdGUpIHtcbiAgICAgICAgICAgIHNjb3BlLiRhcHBseShzb3J0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChzb3J0RGVmYXVsdCkge1xuICAgICAgICAgIGluZGV4ID0gYXR0ci5zdFNvcnREZWZhdWx0ID09PSAncmV2ZXJzZScgPyAxIDogMDtcbiAgICAgICAgICBzb3J0KCk7XG4gICAgICAgIH1cblxuICAgICAgICAvL3RhYmxlIHN0YXRlIC0tPiB2aWV3XG4gICAgICAgIHNjb3BlLiR3YXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIGN0cmwudGFibGVTdGF0ZSgpLnNvcnQ7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgIGlmIChuZXdWYWx1ZS5wcmVkaWNhdGUgIT09IHByZWRpY2F0ZSkge1xuICAgICAgICAgICAgaW5kZXggPSAwO1xuICAgICAgICAgICAgZWxlbWVudFxuICAgICAgICAgICAgICAucmVtb3ZlQ2xhc3MoY2xhc3NBc2NlbnQpXG4gICAgICAgICAgICAgIC5yZW1vdmVDbGFzcyhjbGFzc0Rlc2NlbnQpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbmRleCA9IG5ld1ZhbHVlLnJldmVyc2UgPT09IHRydWUgPyAyIDogMTtcbiAgICAgICAgICAgIGVsZW1lbnRcbiAgICAgICAgICAgICAgLnJlbW92ZUNsYXNzKHN0YXRlQ2xhc3Nlc1tpbmRleCAlIDJdKVxuICAgICAgICAgICAgICAuYWRkQ2xhc3Moc3RhdGVDbGFzc2VzW2luZGV4IC0gMV0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXG4gIC5kaXJlY3RpdmUoJ3N0UGFnaW5hdGlvbicsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmVzdHJpY3Q6ICdFQScsXG4gICAgICByZXF1aXJlOiAnXnN0VGFibGUnLFxuICAgICAgc2NvcGU6IHtcbiAgICAgICAgc3RJdGVtc0J5UGFnZTogJz0/JyxcbiAgICAgICAgc3REaXNwbGF5ZWRQYWdlczogJz0/JyxcbiAgICAgICAgc3RQYWdlQ2hhbmdlOiAnJidcbiAgICAgIH0sXG4gICAgICB0ZW1wbGF0ZVVybDogZnVuY3Rpb24gKGVsZW1lbnQsIGF0dHJzKSB7XG4gICAgICAgIGlmIChhdHRycy5zdFRlbXBsYXRlKSB7XG4gICAgICAgICAgcmV0dXJuIGF0dHJzLnN0VGVtcGxhdGU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICd0ZW1wbGF0ZS9zbWFydC10YWJsZS9wYWdpbmF0aW9uLmh0bWwnO1xuICAgICAgfSxcbiAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0cnMsIGN0cmwpIHtcblxuICAgICAgICBzY29wZS5zdEl0ZW1zQnlQYWdlID0gc2NvcGUuc3RJdGVtc0J5UGFnZSA/ICsoc2NvcGUuc3RJdGVtc0J5UGFnZSkgOiAxMDtcbiAgICAgICAgc2NvcGUuc3REaXNwbGF5ZWRQYWdlcyA9IHNjb3BlLnN0RGlzcGxheWVkUGFnZXMgPyArKHNjb3BlLnN0RGlzcGxheWVkUGFnZXMpIDogNTtcblxuICAgICAgICBzY29wZS5jdXJyZW50UGFnZSA9IDE7XG4gICAgICAgIHNjb3BlLnBhZ2VzID0gW107XG5cbiAgICAgICAgZnVuY3Rpb24gcmVkcmF3KCkge1xuICAgICAgICAgIHZhciBwYWdpbmF0aW9uU3RhdGUgPSBjdHJsLnRhYmxlU3RhdGUoKS5wYWdpbmF0aW9uO1xuICAgICAgICAgIHZhciBzdGFydCA9IDE7XG4gICAgICAgICAgdmFyIGVuZDtcbiAgICAgICAgICB2YXIgaTtcbiAgICAgICAgICB2YXIgcHJldlBhZ2UgPSBzY29wZS5jdXJyZW50UGFnZTtcbiAgICAgICAgICBzY29wZS5jdXJyZW50UGFnZSA9IE1hdGguZmxvb3IocGFnaW5hdGlvblN0YXRlLnN0YXJ0IC8gcGFnaW5hdGlvblN0YXRlLm51bWJlcikgKyAxO1xuXG4gICAgICAgICAgc3RhcnQgPSBNYXRoLm1heChzdGFydCwgc2NvcGUuY3VycmVudFBhZ2UgLSBNYXRoLmFicyhNYXRoLmZsb29yKHNjb3BlLnN0RGlzcGxheWVkUGFnZXMgLyAyKSkpO1xuICAgICAgICAgIGVuZCA9IHN0YXJ0ICsgc2NvcGUuc3REaXNwbGF5ZWRQYWdlcztcblxuICAgICAgICAgIGlmIChlbmQgPiBwYWdpbmF0aW9uU3RhdGUubnVtYmVyT2ZQYWdlcykge1xuICAgICAgICAgICAgZW5kID0gcGFnaW5hdGlvblN0YXRlLm51bWJlck9mUGFnZXMgKyAxO1xuICAgICAgICAgICAgc3RhcnQgPSBNYXRoLm1heCgxLCBlbmQgLSBzY29wZS5zdERpc3BsYXllZFBhZ2VzKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBzY29wZS5wYWdlcyA9IFtdO1xuICAgICAgICAgIHNjb3BlLm51bVBhZ2VzID0gcGFnaW5hdGlvblN0YXRlLm51bWJlck9mUGFnZXM7XG5cbiAgICAgICAgICBmb3IgKGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgICAgICAgICBzY29wZS5wYWdlcy5wdXNoKGkpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChwcmV2UGFnZSE9PXNjb3BlLmN1cnJlbnRQYWdlKSB7XG4gICAgICAgICAgICBzY29wZS5zdFBhZ2VDaGFuZ2Uoe25ld1BhZ2U6IHNjb3BlLmN1cnJlbnRQYWdlfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy90YWJsZSBzdGF0ZSAtLT4gdmlld1xuICAgICAgICBzY29wZS4kd2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiBjdHJsLnRhYmxlU3RhdGUoKS5wYWdpbmF0aW9uO1xuICAgICAgICB9LCByZWRyYXcsIHRydWUpO1xuXG4gICAgICAgIC8vc2NvcGUgLS0+IHRhYmxlIHN0YXRlICAoLS0+IHZpZXcpXG4gICAgICAgIHNjb3BlLiR3YXRjaCgnc3RJdGVtc0J5UGFnZScsIGZ1bmN0aW9uIChuZXdWYWx1ZSwgb2xkVmFsdWUpIHtcbiAgICAgICAgICBpZiAobmV3VmFsdWUgIT09IG9sZFZhbHVlKSB7XG4gICAgICAgICAgICBzY29wZS5zZWxlY3RQYWdlKDEpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoKCdzdERpc3BsYXllZFBhZ2VzJywgcmVkcmF3KTtcblxuICAgICAgICAvL3ZpZXcgLT4gdGFibGUgc3RhdGVcbiAgICAgICAgc2NvcGUuc2VsZWN0UGFnZSA9IGZ1bmN0aW9uIChwYWdlKSB7XG4gICAgICAgICAgaWYgKHBhZ2UgPiAwICYmIHBhZ2UgPD0gc2NvcGUubnVtUGFnZXMpIHtcbiAgICAgICAgICAgIGN0cmwuc2xpY2UoKHBhZ2UgLSAxKSAqIHNjb3BlLnN0SXRlbXNCeVBhZ2UsIHNjb3BlLnN0SXRlbXNCeVBhZ2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBpZighY3RybC50YWJsZVN0YXRlKCkucGFnaW5hdGlvbi5udW1iZXIpe1xuICAgICAgICAgIGN0cmwuc2xpY2UoMCwgc2NvcGUuc3RJdGVtc0J5UGFnZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuICB9KTtcbiIsIm5nLm1vZHVsZSgnc21hcnQtdGFibGUnKVxuICAuZGlyZWN0aXZlKCdzdFBpcGUnLCBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlcXVpcmU6ICdzdFRhYmxlJyxcbiAgICAgIHNjb3BlOiB7XG4gICAgICAgIHN0UGlwZTogJz0nXG4gICAgICB9LFxuICAgICAgbGluazoge1xuXG4gICAgICAgIHByZTogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRycywgY3RybCkge1xuICAgICAgICAgIGlmIChuZy5pc0Z1bmN0aW9uKHNjb3BlLnN0UGlwZSkpIHtcbiAgICAgICAgICAgIGN0cmwucHJldmVudFBpcGVPbldhdGNoKCk7XG4gICAgICAgICAgICBjdHJsLnBpcGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5zdFBpcGUoY3RybC50YWJsZVN0YXRlKCksIGN0cmwpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBwb3N0OiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzLCBjdHJsKSB7XG4gICAgICAgICAgY3RybC5waXBlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuICB9KTtcbiIsIn0pKGFuZ3VsYXIpOyJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==