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
    .directive('stSelectFilter', ['$interpolate', '$log', function ($interpolate, $log) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy90b3AudHh0Iiwic3JjL3NtYXJ0LXRhYmxlLm1vZHVsZS5qcyIsInNyYy9zdFRhYmxlLmpzIiwic3JjL3N0U2VhcmNoLmpzIiwic3JjL3N0U2VsZWN0RmlsdGVyLmpzIiwic3JjL3N0U2VsZWN0Um93LmpzIiwic3JjL3N0U29ydC5qcyIsInNyYy9zdFBhZ2luYXRpb24uanMiLCJzcmMvc3RQaXBlLmpzIiwic3JjL2JvdHRvbS50eHQiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FDRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDeFFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzVGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2hFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDL0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDeEJBIiwiZmlsZSI6InNtYXJ0LXRhYmxlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIChuZywgdW5kZWZpbmVkKXtcbiAgICAndXNlIHN0cmljdCc7XG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJywgW10pLnJ1bihbJyR0ZW1wbGF0ZUNhY2hlJywgZnVuY3Rpb24gKCR0ZW1wbGF0ZUNhY2hlKSB7XG4gICAgJHRlbXBsYXRlQ2FjaGUucHV0KCd0ZW1wbGF0ZS9zbWFydC10YWJsZS9wYWdpbmF0aW9uLmh0bWwnLFxuICAgICAgICAnPG5hdiBuZy1pZj1cInBhZ2VzLmxlbmd0aCA+PSAyXCI+PHVsIGNsYXNzPVwicGFnaW5hdGlvblwiPicgK1xuICAgICAgICAnPGxpIG5nLXJlcGVhdD1cInBhZ2UgaW4gcGFnZXNcIiBuZy1jbGFzcz1cInthY3RpdmU6IHBhZ2U9PWN1cnJlbnRQYWdlfVwiPjxhIG5nLWNsaWNrPVwic2VsZWN0UGFnZShwYWdlKVwiPnt7cGFnZX19PC9hPjwvbGk+JyArXG4gICAgICAgICc8L3VsPjwvbmF2PicpO1xufV0pO1xuXG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcbiAgICAuY29udHJvbGxlcignc3RUYWJsZUNvbnRyb2xsZXInLCBbJyRzY29wZScsICckcGFyc2UnLCAnJGZpbHRlcicsICckYXR0cnMnLCBmdW5jdGlvbiBTdFRhYmxlQ29udHJvbGxlcigkc2NvcGUsICRwYXJzZSwgJGZpbHRlciwgJGF0dHJzKSB7XG4gICAgICAgIHZhciBwcm9wZXJ0eU5hbWUgPSAkYXR0cnMuc3RUYWJsZTtcbiAgICAgICAgdmFyIGRpc3BsYXlHZXR0ZXIgPSAkcGFyc2UocHJvcGVydHlOYW1lKTtcbiAgICAgICAgdmFyIGRpc3BsYXlTZXR0ZXIgPSBkaXNwbGF5R2V0dGVyLmFzc2lnbjtcbiAgICAgICAgdmFyIHNhZmVHZXR0ZXI7XG4gICAgICAgIHZhciBvcmRlckJ5ID0gJGZpbHRlcignb3JkZXJCeScpO1xuICAgICAgICB2YXIgZmlsdGVyID0gJGZpbHRlcignZmlsdGVyJyk7XG4gICAgICAgIHZhciBzYWZlQ29weSA9IGNvcHlSZWZzKGRpc3BsYXlHZXR0ZXIoJHNjb3BlKSk7XG4gICAgICAgIHZhciB0YWJsZVN0YXRlID0ge1xuICAgICAgICAgICAgc29ydDoge30sXG4gICAgICAgICAgICBmaWx0ZXJzOiB7fSxcbiAgICAgICAgICAgIHBhZ2luYXRpb246IHtcbiAgICAgICAgICAgICAgICBzdGFydDogMFxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB2YXIgcGlwZUFmdGVyU2FmZUNvcHkgPSB0cnVlO1xuICAgICAgICB2YXIgY3RybCA9IHRoaXM7XG4gICAgICAgIHZhciBsYXN0U2VsZWN0ZWQ7XG5cblxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBzb3J0IHRoZSByb3dzXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb24gfCBTdHJpbmd9IHByZWRpY2F0ZSAtIGZ1bmN0aW9uIG9yIHN0cmluZyB3aGljaCB3aWxsIGJlIHVzZWQgYXMgcHJlZGljYXRlIGZvciB0aGUgc29ydGluZ1xuICAgICAgICAgKiBAcGFyYW0gW3JldmVyc2VdIC0gaWYgeW91IHdhbnQgdG8gcmV2ZXJzZSB0aGUgb3JkZXJcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuc29ydEJ5ID0gZnVuY3Rpb24gc29ydEJ5KHByZWRpY2F0ZSwgcmV2ZXJzZSkge1xuICAgICAgICAgICAgdGFibGVTdGF0ZS5zb3J0LnByZWRpY2F0ZSA9IHByZWRpY2F0ZTtcbiAgICAgICAgICAgIHRhYmxlU3RhdGUuc29ydC5yZXZlcnNlID0gcmV2ZXJzZSA9PT0gdHJ1ZTtcblxuICAgICAgICAgICAgaWYgKG5nLmlzRnVuY3Rpb24ocHJlZGljYXRlKSkge1xuICAgICAgICAgICAgICB0YWJsZVN0YXRlLnNvcnQuZnVuY3Rpb25OYW1lID0gcHJlZGljYXRlLm5hbWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBkZWxldGUgdGFibGVTdGF0ZS5zb3J0LmZ1bmN0aW9uTmFtZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGFibGVTdGF0ZS5wYWdpbmF0aW9uLnN0YXJ0ID0gMDtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBpcGUoKTtcbiAgICAgICAgfTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogUmVnaXN0ZXIgYSBmaWx0ZXJcbiAgICAgICAgICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgLSBuYW1lIG9mIGZpbHRlclxuICAgICAgICAgKiBAcGFyYW0ge2Z1bmN0aW9uKGFjdHVhbCwgZXhwZWN0ZWQpfHRydWV8dW5kZWZpbmVkfSBjb21wYXJhdG9yIENvbXBhcmF0b3Igd2hpY2ggaXMgdXNlZCBpbiBkZXRlcm1pbmluZyBpZiB0aGVcbiAgICAgICAgICogICAgIGV4cGVjdGVkIHZhbHVlIChmcm9tIHRoZSBmaWx0ZXIgZXhwcmVzc2lvbikgYW5kIGFjdHVhbCB2YWx1ZSAoZnJvbSB0aGUgb2JqZWN0IGluIHRoZSBhcnJheSkgc2hvdWxkIGJlXG4gICAgICAgICAqICAgICBjb25zaWRlcmVkIGEgbWF0Y2guIFNlZSBhbHNvIGh0dHBzOi8vZG9jcy5hbmd1bGFyanMub3JnL2FwaS9uZy9maWx0ZXIvZmlsdGVyLlxuICAgICAgICAgKiBAcGFyYW0ge1N0cmluZ3x1bmRlZmluZWR9IGVtcHR5VmFsdWUgVmFsdWUgdGhhdCByZXByZXNlbnRzIGEgJ25vIGZpbHRlcicgdmFsdWUuXG4gICAgICAgICAqIEByZXR1cm5zIHtPYmplY3R9IC0gZmlsdGVyIG9iamVjdCB3aXRoIHByZWRpY2F0ZU9iamVjdCBhbmQgY29tcGFyYXRvci5cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMucmVnaXN0ZXJGaWx0ZXIgPSBmdW5jdGlvbihuYW1lLCBjb21wYXJhdG9yLCBlbXB0eVZhbHVlKSB7XG4gICAgICAgICAgICBpZiAodGFibGVTdGF0ZS5maWx0ZXJzPT09dW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGFibGVTdGF0ZS5maWx0ZXJzID0ge307XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgZmlsdGVyID0gdGFibGVTdGF0ZS5maWx0ZXJzW25hbWVdO1xuICAgICAgICAgICAgaWYgKGZpbHRlcj09PXVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGZpbHRlciA9IHtcbiAgICAgICAgICAgICAgICAgICAgY29tcGFyYXRvcjogY29tcGFyYXRvcixcbiAgICAgICAgICAgICAgICAgICAgcHJlZGljYXRlT2JqZWN0OiB7fSxcbiAgICAgICAgICAgICAgICAgICAgZW1wdHlWYWx1ZTogKGVtcHR5VmFsdWUhPT11bmRlZmluZWQgPyBlbXB0eVZhbHVlIDogJycpXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB0YWJsZVN0YXRlLmZpbHRlcnNbbmFtZV0gPSBmaWx0ZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmlsdGVyO1xuICAgICAgICB9O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBzZWFyY2ggbWF0Y2hpbmcgcm93c1xuICAgICAgICAgKiBAZGVwcmVjYXRlZCB0aGlzIG1ldGhvZCBpcyBvbmx5IG1lYW50IGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eS5cbiAgICAgICAgICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IC0gdGhlIGlucHV0IHN0cmluZ1xuICAgICAgICAgKiBAcGFyYW0ge1N0cmluZ30gW3ByZWRpY2F0ZV0gLSB0aGUgcHJvcGVydHkgbmFtZSBhZ2FpbnN0IHlvdSB3YW50IHRvIGNoZWNrIHRoZSBtYXRjaCwgb3RoZXJ3aXNlIGl0IHdpbGwgc2VhcmNoIG9uIGFsbCBwcm9wZXJ0aWVzXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnNlYXJjaCA9IGZ1bmN0aW9uIHNlYXJjaChpbnB1dCwgcHJlZGljYXRlKSB7XG4gICAgICAgICAgICB2YXIgc2VhcmNoRmlsdGVyID0gdGhpcy5yZWdpc3RlckZpbHRlcignc2VhcmNoJyk7IC8vIG1ha2Ugc3VyZSAnc2VhcmNoJyBmaWx0ZXIgZXhpc3RzLCBnZXQgY29weSBpZiBhbHJlYWR5IHJlZ2lzdGVyZWQuXG4gICAgICAgICAgICB0aGlzLmFwcGx5RmlsdGVyKGlucHV0LCBwcmVkaWNhdGUsIHNlYXJjaEZpbHRlcik7XG4gICAgICAgIH07XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIGFwcGx5IGZpbHRlciB0byByb3cgZGF0YVxuICAgICAgICAgKiBAcGFyYW0ge1N0cmluZ30gaW5wdXQgLSB0aGUgaW5wdXQgc3RyaW5nXG4gICAgICAgICAqIEBwYXJhbSB7U3RyaW5nfSBwcmVkaWNhdGUgLSB0aGUgcHJvcGVydHkgbmFtZSBhZ2FpbnN0IHlvdSB3YW50IHRvIGNoZWNrIHRoZSBtYXRjaCwgb3RoZXJ3aXNlIGl0IHdpbGwgc2VhcmNoIG9uIGFsbCBwcm9wZXJ0aWVzXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBmaWx0ZXIgLSB0aGUgZmlsdGVyIHRoYXQgaXMgZ29pbmcgdG8gYmUgYXBwbGllZFxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5hcHBseUZpbHRlciA9IGZ1bmN0aW9uKGlucHV0LCBwcmVkaWNhdGUsIGZpbHRlcikge1xuICAgICAgICAgICAgdmFyIHByb3AgPSBwcmVkaWNhdGUgfHwgJyQnO1xuICAgICAgICAgICAgZmlsdGVyLnByZWRpY2F0ZU9iamVjdFtwcm9wXSA9IGlucHV0O1xuICAgICAgICAgICAgLy8gdG8gYXZvaWQgdG8gZmlsdGVyIG91dCBudWxsIHZhbHVlXG4gICAgICAgICAgICBpZiAoaW5wdXQ9PT1maWx0ZXIuZW1wdHlWYWx1ZSkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSBmaWx0ZXIucHJlZGljYXRlT2JqZWN0W3Byb3BdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGFibGVTdGF0ZS5wYWdpbmF0aW9uLnN0YXJ0ID0gMDtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBpcGUoKTtcbiAgICAgICAgfTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogdGhpcyB3aWxsIGNoYWluIHRoZSBvcGVyYXRpb25zIG9mIHNvcnRpbmcgYW5kIGZpbHRlcmluZyBiYXNlZCBvbiB0aGUgY3VycmVudCB0YWJsZSBzdGF0ZSAoc29ydCBvcHRpb25zLCBmaWx0ZXJpbmcsIGVjdClcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMucGlwZSA9IGZ1bmN0aW9uIHBpcGUoKSB7XG4gICAgICAgICAgICB2YXIgcGFnaW5hdGlvbiA9IHRhYmxlU3RhdGUucGFnaW5hdGlvbjtcblxuICAgICAgICAgICAgdmFyIGZpbHRlcmVkID0gc2FmZUNvcHk7XG4gICAgICAgICAgICBhbmd1bGFyLmZvckVhY2godGFibGVTdGF0ZS5maWx0ZXJzLCBmdW5jdGlvbihmaWx0ZXJPYmopIHtcbiAgICAgICAgICAgICAgICB2YXIgcHJlZGljYXRlT2JqZWN0ID0gZmlsdGVyT2JqLnByZWRpY2F0ZU9iamVjdDtcbiAgICAgICAgICAgICAgICBpZiAoT2JqZWN0LmtleXMocHJlZGljYXRlT2JqZWN0KS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcmVkID0gZmlsdGVyKGZpbHRlcmVkLCBwcmVkaWNhdGVPYmplY3QsIGZpbHRlck9iai5jb21wYXJhdG9yKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgaWYgKHRhYmxlU3RhdGUuc29ydC5wcmVkaWNhdGUpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZCA9IG9yZGVyQnkoZmlsdGVyZWQsIHRhYmxlU3RhdGUuc29ydC5wcmVkaWNhdGUsIHRhYmxlU3RhdGUuc29ydC5yZXZlcnNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwYWdpbmF0aW9uLm51bWJlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgcGFnaW5hdGlvbi5udW1iZXJPZlBhZ2VzID0gZmlsdGVyZWQubGVuZ3RoID4gMCA/IE1hdGguY2VpbChmaWx0ZXJlZC5sZW5ndGggLyBwYWdpbmF0aW9uLm51bWJlcikgOiAxO1xuICAgICAgICAgICAgICAgIHBhZ2luYXRpb24uc3RhcnQgPSBwYWdpbmF0aW9uLnN0YXJ0ID49IGZpbHRlcmVkLmxlbmd0aCA/IChwYWdpbmF0aW9uLm51bWJlck9mUGFnZXMgLSAxKSAqIHBhZ2luYXRpb24ubnVtYmVyIDogcGFnaW5hdGlvbi5zdGFydDtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZCA9IGZpbHRlcmVkLnNsaWNlKHBhZ2luYXRpb24uc3RhcnQsIHBhZ2luYXRpb24uc3RhcnQgKyBwYXJzZUludChwYWdpbmF0aW9uLm51bWJlcikpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGlzcGxheVNldHRlcigkc2NvcGUsIGZpbHRlcmVkKTtcbiAgICAgICAgfTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogc2VsZWN0IGEgZGF0YVJvdyAoaXQgd2lsbCBhZGQgdGhlIGF0dHJpYnV0ZSBpc1NlbGVjdGVkIHRvIHRoZSByb3cgb2JqZWN0KVxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gcm93IC0gdGhlIHJvdyB0byBzZWxlY3RcbiAgICAgICAgICogQHBhcmFtIHtTdHJpbmd9IFttb2RlXSAtIFwic2luZ2xlXCIgb3IgXCJtdWx0aXBsZVwiIChtdWx0aXBsZSBieSBkZWZhdWx0KVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5zZWxlY3QgPSBmdW5jdGlvbiBzZWxlY3Qocm93LCBtb2RlKSB7XG4gICAgICAgICAgICB2YXIgcm93cyA9IHNhZmVDb3B5O1xuICAgICAgICAgICAgdmFyIGluZGV4ID0gcm93cy5pbmRleE9mKHJvdyk7XG4gICAgICAgICAgICBpZiAoaW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1vZGUgPT09ICdzaW5nbGUnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJvdy5pc1NlbGVjdGVkID0gcm93LmlzU2VsZWN0ZWQgIT09IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGlmIChsYXN0U2VsZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxhc3RTZWxlY3RlZC5pc1NlbGVjdGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgbGFzdFNlbGVjdGVkID0gcm93LmlzU2VsZWN0ZWQgPT09IHRydWUgPyByb3cgOiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcm93c1tpbmRleF0uaXNTZWxlY3RlZCA9ICFyb3dzW2luZGV4XS5pc1NlbGVjdGVkO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogdGFrZSBhIHNsaWNlIG9mIHRoZSBjdXJyZW50IHNvcnRlZC9maWx0ZXJlZCBjb2xsZWN0aW9uIChwYWdpbmF0aW9uKVxuICAgICAgICAgKlxuICAgICAgICAgKiBAcGFyYW0ge051bWJlcn0gc3RhcnQgLSBzdGFydCBpbmRleCBvZiB0aGUgc2xpY2VcbiAgICAgICAgICogQHBhcmFtIHtOdW1iZXJ9IG51bWJlciAtIHRoZSBudW1iZXIgb2YgaXRlbSBpbiB0aGUgc2xpY2VcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuc2xpY2UgPSBmdW5jdGlvbiBzcGxpY2Uoc3RhcnQsIG51bWJlcikge1xuICAgICAgICAgICAgdGFibGVTdGF0ZS5wYWdpbmF0aW9uLnN0YXJ0ID0gc3RhcnQ7XG4gICAgICAgICAgICB0YWJsZVN0YXRlLnBhZ2luYXRpb24ubnVtYmVyID0gbnVtYmVyO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMucGlwZSgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiByZXR1cm4gdGhlIGN1cnJlbnQgc3RhdGUgb2YgdGhlIHRhYmxlXG4gICAgICAgICAqIEByZXR1cm5zIHt7c29ydDoge30sIHNlYXJjaDoge30sIGZpbHRlcnM6IHt9LCBwYWdpbmF0aW9uOiB7c3RhcnQ6IG51bWJlcn19fVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy50YWJsZVN0YXRlID0gZnVuY3Rpb24gZ2V0VGFibGVTdGF0ZSgpIHtcblxuICAgICAgICAgICAgLy8gZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5LCBtYWtlIHN1cmUgdGFibGVTdGF0ZS5zZWFyY2ggZXhpc3RzLlxuICAgICAgICAgICAgdGFibGVTdGF0ZS5zZWFyY2ggPSB0YWJsZVN0YXRlLmZpbHRlcnMuc2VhcmNoID8gdGFibGVTdGF0ZS5maWx0ZXJzLnNlYXJjaCA6IHt9O1xuXG4gICAgICAgICAgICByZXR1cm4gdGFibGVTdGF0ZTtcbiAgICAgICAgfTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogVXNlIGEgZGlmZmVyZW50IGZpbHRlciBmdW5jdGlvbiB0aGFuIHRoZSBhbmd1bGFyIEZpbHRlckZpbHRlclxuICAgICAgICAgKiBAcGFyYW0gZmlsdGVyTmFtZSB0aGUgbmFtZSB1bmRlciB3aGljaCB0aGUgY3VzdG9tIGZpbHRlciBpcyByZWdpc3RlcmVkXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnNldEZpbHRlckZ1bmN0aW9uID0gZnVuY3Rpb24gc2V0RmlsdGVyRnVuY3Rpb24oZmlsdGVyTmFtZSkge1xuICAgICAgICAgICAgZmlsdGVyID0gJGZpbHRlcihmaWx0ZXJOYW1lKTtcbiAgICAgICAgfTtcblxuICAgICAgICAvKipcbiAgICAgICAgICpVc2VyIGEgZGlmZmVyZW50IGZ1bmN0aW9uIHRoYW4gdGhlIGFuZ3VsYXIgb3JkZXJCeVxuICAgICAgICAgKiBAcGFyYW0gc29ydEZ1bmN0aW9uTmFtZSB0aGUgbmFtZSB1bmRlciB3aGljaCB0aGUgY3VzdG9tIG9yZGVyIGZ1bmN0aW9uIGlzIHJlZ2lzdGVyZWRcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuc2V0U29ydEZ1bmN0aW9uID0gZnVuY3Rpb24gc2V0U29ydEZ1bmN0aW9uKHNvcnRGdW5jdGlvbk5hbWUpIHtcbiAgICAgICAgICAgIG9yZGVyQnkgPSAkZmlsdGVyKHNvcnRGdW5jdGlvbk5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBVc3VhbGx5IHdoZW4gdGhlIHNhZmUgY29weSBpcyB1cGRhdGVkIHRoZSBwaXBlIGZ1bmN0aW9uIGlzIGNhbGxlZC5cbiAgICAgICAgICogQ2FsbGluZyB0aGlzIG1ldGhvZCB3aWxsIHByZXZlbnQgaXQsIHdoaWNoIGlzIHNvbWV0aGluZyByZXF1aXJlZCB3aGVuIHVzaW5nIGEgY3VzdG9tIHBpcGUgZnVuY3Rpb25cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMucHJldmVudFBpcGVPbldhdGNoID0gZnVuY3Rpb24gcHJldmVudFBpcGUoKSB7XG4gICAgICAgICAgICBwaXBlQWZ0ZXJTYWZlQ29weSA9IGZhbHNlO1xuICAgICAgICB9O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBDb252ZW5pZW50IG1ldGhvZCB0byBkZXRlcm1pbmUgdGhlIHVuaXF1ZSB2YWx1ZXMgZm9yIGEgZ2l2ZW4gcHJlZGljYXRlLlxuICAgICAgICAgKiBUaGlzIG1ldGhvZCBpcyB1c2VkIGluIHN0U2VsZWN0RmlsdGVyIHRvIGRldGVybWluZSB0aGUgb3B0aW9ucyBmb3IgdGhlIHNlbGVjdCBlbGVtZW50LlxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5nZXRVbmlxdWVWYWx1ZXMgPSBmdW5jdGlvbihwcmVkaWNhdGUpIHtcbiAgICAgICAgICAgIHZhciBzZWVuO1xuICAgICAgICAgICAgdmFyIGdldHRlciA9ICRwYXJzZShwcmVkaWNhdGUpO1xuICAgICAgICAgICAgcmV0dXJuIHNhZmVDb3B5XG4gICAgICAgICAgICAgICAgLm1hcChmdW5jdGlvbihlbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0dGVyKGVsKTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAgICAgICAuZmlsdGVyKGZ1bmN0aW9uKGVsKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzZWVuID09PSB1bmRlZmluZWQgfHwgc2VlbiAhPT0gZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlZW4gPSBlbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuXG5cbiAgICAgICAgLy8gVGhlIGNvbnN0cnVjdG9yIGxvZ2ljIGlzIG1vdmVkIGRvd24gdG8gYXBwZWFyIHVuZGVyIHRoZSBkZWZpbml0aW9ucyBvZiB0aGUgbWVtYmVyIGZ1bmN0aW9ucy4gVGhpcyB0byBtYWtlXG4gICAgICAgIC8vIHN1cmUgdGhlIHBpcGUgZnVuY3Rpb24gaXMgZGVmaW5lZCBiZWZvcmUgd2UgYXR0ZW1wdCB0byBjYWxsIGl0LlxuXG4gICAgICAgIGZ1bmN0aW9uIGNvcHlSZWZzKHNyYykge1xuICAgICAgICAgICAgcmV0dXJuIHNyYyA/IFtdLmNvbmNhdChzcmMpIDogW107XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiB1cGRhdGVTYWZlQ29weSgpIHtcbiAgICAgICAgICAgIHNhZmVDb3B5ID0gY29weVJlZnMoc2FmZUdldHRlcigkc2NvcGUpKTtcbiAgICAgICAgICAgIGlmIChwaXBlQWZ0ZXJTYWZlQ29weSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIGN0cmwucGlwZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCRhdHRycy5zdFNhZmVTcmMpIHtcbiAgICAgICAgICAgIHNhZmVHZXR0ZXIgPSAkcGFyc2UoJGF0dHJzLnN0U2FmZVNyYyk7XG5cbiAgICAgICAgICAgICRzY29wZS4kd2F0Y2hHcm91cChbZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdmFyIHNhZmVTcmMgPSBzYWZlR2V0dGVyKCRzY29wZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNhZmVTcmMgPyBzYWZlU3JjLmxlbmd0aCA6IDA7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2FmZUdldHRlcigkc2NvcGUpO1xuICAgICAgICAgICAgfV0sIGZ1bmN0aW9uKG5ld1ZhbHVlcywgb2xkVmFsdWVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9sZFZhbHVlc1swXSAhPT0gbmV3VmFsdWVzWzBdIHx8IG9sZFZhbHVlc1sxXSAhPT0gbmV3VmFsdWVzWzFdKSB7XG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZVNhZmVDb3B5KCk7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS4kYnJvYWRjYXN0KCdzdC1zYWZlU3JjQ2hhbmdlZCcsIG51bGwpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBtYWtlIHN1cmUgdGhhdCBzdFRhYmxlIGlzIGRlZmluZWQgb24gJHNjb3BlLiBFaXRoZXIgaW1wbGljaXRseSBieSBjYWxsaW5nIHVwZGF0ZVNhZmVDb3B5IG9yIGV4cGxpY2l0bHkuXG4gICAgICAgICAgICAvLyBieSBjYWxsaW5nIGRpc3BsYXlTZXR0ZXIuXG4gICAgICAgICAgICB1cGRhdGVTYWZlQ29weSgpO1xuICAgICAgICAgICAgaWYgKHBpcGVBZnRlclNhZmVDb3B5ICE9PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgZGlzcGxheVNldHRlcigkc2NvcGUsIHNhZmVDb3B5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1dKVxuICAgIC5kaXJlY3RpdmUoJ3N0VGFibGUnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXN0cmljdDogJ0EnLFxuICAgICAgICAgICAgY29udHJvbGxlcjogJ3N0VGFibGVDb250cm9sbGVyJyxcbiAgICAgICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0ciwgY3RybCkge1xuXG4gICAgICAgICAgICAgICAgaWYgKGF0dHIuc3RTZXRGaWx0ZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgY3RybC5zZXRGaWx0ZXJGdW5jdGlvbihhdHRyLnN0U2V0RmlsdGVyKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoYXR0ci5zdFNldFNvcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgY3RybC5zZXRTb3J0RnVuY3Rpb24oYXR0ci5zdFNldFNvcnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9KTtcbiIsIm5nLm1vZHVsZSgnc21hcnQtdGFibGUnKVxuICAgIC5kaXJlY3RpdmUoJ3N0U2VhcmNoJywgWyckdGltZW91dCcsIGZ1bmN0aW9uICgkdGltZW91dCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmVxdWlyZTogJ15zdFRhYmxlJyxcbiAgICAgICAgICAgIHNjb3BlOiB7XG4gICAgICAgICAgICAgICAgcHJlZGljYXRlOiAnPT9zdFNlYXJjaCdcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcbiAgICAgICAgICAgICAgICB2YXIgdGFibGVDdHJsID0gY3RybDtcbiAgICAgICAgICAgICAgICB2YXIgcHJvbWlzZSA9IG51bGw7XG4gICAgICAgICAgICAgICAgdmFyIHRocm90dGxlID0gYXR0ci5zdERlbGF5IHx8IDQwMDtcbiAgICAgICAgICAgICAgICB2YXIgZmlsdGVyID0gY3RybC5yZWdpc3RlckZpbHRlcignc2VhcmNoJyk7XG5cbiAgICAgICAgICAgICAgICBzY29wZS4kd2F0Y2goJ3ByZWRpY2F0ZScsIGZ1bmN0aW9uIChuZXdWYWx1ZSwgb2xkVmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5ld1ZhbHVlICE9PSBvbGRWYWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGZpbHRlci5wcmVkaWNhdGVPYmplY3Rbb2xkVmFsdWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFibGVDdHJsLmFwcGx5RmlsdGVyKGVsZW1lbnRbMF0udmFsdWUsIG5ld1ZhbHVlLCBmaWx0ZXIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvL3RhYmxlIHN0YXRlIC0+IHZpZXdcbiAgICAgICAgICAgICAgICBzY29wZS4kd2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmlsdGVyLnByZWRpY2F0ZU9iamVjdDtcbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHByZWRpY2F0ZU9iamVjdCA9IG5ld1ZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB2YXIgcHJlZGljYXRlRXhwcmVzc2lvbiA9IHNjb3BlLnByZWRpY2F0ZSB8fCAnJCc7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwcmVkaWNhdGVPYmplY3QgJiYgcHJlZGljYXRlT2JqZWN0W3ByZWRpY2F0ZUV4cHJlc3Npb25dICE9PSBlbGVtZW50WzBdLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50WzBdLnZhbHVlID0gcHJlZGljYXRlT2JqZWN0W3ByZWRpY2F0ZUV4cHJlc3Npb25dIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgICAgICAgICAvLyB2aWV3IC0+IHRhYmxlIHN0YXRlXG4gICAgICAgICAgICAgICAgZWxlbWVudC5iaW5kKCdpbnB1dCcsIGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgICAgICAgICAgICAgZXZ0ID0gZXZ0Lm9yaWdpbmFsRXZlbnQgfHwgZXZ0O1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJvbWlzZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgJHRpbWVvdXQuY2FuY2VsKHByb21pc2UpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHByb21pc2UgPSAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YWJsZUN0cmwuYXBwbHlGaWx0ZXIoZXZ0LnRhcmdldC52YWx1ZSwgc2NvcGUucHJlZGljYXRlLCBmaWx0ZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJvbWlzZSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIH0sIHRocm90dGxlKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9XSk7XG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcbiAgICAuZGlyZWN0aXZlKCdzdFNlbGVjdEZpbHRlcicsIFsnJGludGVycG9sYXRlJywgJyRsb2cnLCBmdW5jdGlvbiAoJGludGVycG9sYXRlLCAkbG9nKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXBsYWNlOiB0cnVlLFxuICAgICAgICAgICAgcmVxdWlyZTogJ15zdFRhYmxlJyxcbiAgICAgICAgICAgIHNjb3BlOiB7XG4gICAgICAgICAgICAgICAgcHJlZGljYXRlOiAnPT9zdFNlbGVjdEZpbHRlcicsXG4gICAgICAgICAgICAgICAgYXR0ck9wdGlvbnM6ICc9P29wdGlvbnMnLFxuICAgICAgICAgICAgICAgIHNlbGVjdGVkOiAnPT92YWx1ZScsXG4gICAgICAgICAgICAgICAgY29tcGFyYXRvcjogJyYnXG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICB0ZW1wbGF0ZTogZnVuY3Rpb24odEVsZW1lbnQsIHRBdHRycykge1xuICAgICAgICAgICAgICAgIHZhciBlbXB0eUxhYmVsID0gdEF0dHJzLmVtcHR5TGFiZWwgPyB0QXR0cnMuZW1wdHlMYWJlbCA6ICcnO1xuICAgICAgICAgICAgICAgIHJldHVybiAnPHNlbGVjdCBkYXRhLW5nLW1vZGVsPVwic2VsZWN0ZWRcIiBkYXRhLW5nLW9wdGlvbnM9XCJvcHRpb24udmFsdWUgYXMgb3B0aW9uLmxhYmVsIGZvciBvcHRpb24gaW4gb3B0aW9uc1wiPicgK1xuICAgICAgICAgICAgICAgICAgICAgICAnPG9wdGlvbiB2YWx1ZT1cIlwiPicgKyBlbXB0eUxhYmVsICsgJzwvb3B0aW9uPjwvc2VsZWN0Pic7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRyLCBjdHJsKSB7XG4gICAgICAgICAgICAgICAgdmFyIHRhYmxlQ3RybCA9IGN0cmw7XG4gICAgICAgICAgICAgICAgdmFyIGZpbHRlcjtcbiAgICAgICAgICAgICAgICB2YXIgRklMVEVSX05BTUUgPSAnc2VsZWN0RmlsdGVyJztcblxuICAgICAgICAgICAgICAgIGlmIChhdHRyLmhhc093blByb3BlcnR5KCdjb21wYXJhdG9yJykpIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyBXZSBoYXZlIHRvIHVzZSBhIGdldHRlciB0byBnZXQgdGhlIGFjdHVhbCBmdW5jdGlvbj8hXG4gICAgICAgICAgICAgICAgICAgIHZhciBjb21wYXJhdG9yID0gc2NvcGUuY29tcGFyYXRvcigpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEN1c3RvbSBmaWx0ZXIgbmFtZSBmb3IgY29tcGFyYXRvciwgc3RhbmRhcmQgbmFtZSBwbHVzIG5hbWUgb2YgY29tcGFyYXRvciBmdW5jdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyB3YXkgd2UgcHJldmVudCBtYWtpbmcgbXVsdGlwbGUgZmlsdGVycyBmb3IgdGhlIHNhbWUgY29tcGFyYXRvci5cbiAgICAgICAgICAgICAgICAgICAgdmFyIGN1c3RvbUZpbHRlck5hbWUgPSBGSUxURVJfTkFNRSArICdfJyArIGNvbXBhcmF0b3IubmFtZTtcblxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXIgPSBjdHJsLnJlZ2lzdGVyRmlsdGVyKGN1c3RvbUZpbHRlck5hbWUgLCBjb21wYXJhdG9yLCBudWxsKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgICAgLy8gZGVmYXVsdCB3ZSB1c2Ugc3RyaWN0IGNvbXBhcmlzb25cbiAgICAgICAgICAgICAgICAgICBmaWx0ZXIgPSBjdHJsLnJlZ2lzdGVyRmlsdGVyKEZJTFRFUl9OQU1FLCB0cnVlLCBudWxsKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoc2NvcGUuYXR0ck9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNjb3BlLmF0dHJPcHRpb25zLmxlbmd0aD4wICYmICh0eXBlb2Ygc2NvcGUuYXR0ck9wdGlvbnNbMF0gPT09ICdvYmplY3QnKSkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBvcHRpb25zIGFzIGFycmF5IG9mIG9iamVjdHMsIGVnOiBbe2xhYmVsOidncmVlbicsIHZhbHVlOnRydWV9LCB7bGFiZWw6J3JlZCcsIHZhbHVlOmZhbHNlfV1cbiAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLm9wdGlvbnMgPSBzY29wZS5hdHRyT3B0aW9ucy5zbGljZSgwKTsgLy8gY29weSB2YWx1ZXNcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3B0aW9ucyBhcyBzaW1wbGUgYXJyYXksIGVnOiBbJ2FwcGxlJywgJ2JhbmFuYScsICdjaGVycnknLCAnc3RyYXdiZXJyeScsICdtYW5nbycsICdwaW5lYXBwbGUnXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLm9wdGlvbnMgPSBnZXRPcHRpb25PYmplY3RzRnJvbUFycmF5KHNjb3BlLmF0dHJPcHRpb25zKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhbmd1bGFyLmlzVW5kZWZpbmVkKHNjb3BlLnByZWRpY2F0ZSkgfHwgc2NvcGUucHJlZGljYXRlID09PSAnJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgJGxvZy5lcnJvcignRW1wdHkgcHJlZGljYXRlIHZhbHVlIG5vdCBhbGxvd2VkIGZvciBzdC1zZWxlY3QtZmlsdGVyJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKHNjb3BlLnByZWRpY2F0ZSA9PT0gJyQnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAkbG9nLmVycm9yKCdQcmVkaWNhdGUgdmFsdWUgXFwnJFxcJyBvbmx5IGFsbG93ZWQgZm9yIHN0LXNlbGVjdC1maWx0ZXIgd2hlbiBjb21iaW5lZCB3aXRoIGF0dHJpYnV0ZSBcXCdvcHRpb25zXFwnJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBpZiBub3QgZXhwbGljaXRseSBwYXNzZWQgdGhlbiBkZXRlcm1pbmUgdGhlIG9wdGlvbnMgYnkgbG9va2luZyBhdCB0aGUgY29udGVudCBvZiB0aGUgdGFibGUuXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLm9wdGlvbnMgPSBnZXRPcHRpb25PYmplY3RzRnJvbUFycmF5KGN0cmwuZ2V0VW5pcXVlVmFsdWVzKHNjb3BlLnByZWRpY2F0ZSkpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIHdoZW4gdGhlIHRhYmxlIGRhdGEgaXMgdXBkYXRlZCwgYWxzbyB1cGRhdGUgdGhlIG9wdGlvbnNcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUuJG9uKCdzdC1zYWZlU3JjQ2hhbmdlZCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUub3B0aW9ucyA9IGdldE9wdGlvbk9iamVjdHNGcm9tQXJyYXkoY3RybC5nZXRVbmlxdWVWYWx1ZXMoc2NvcGUucHJlZGljYXRlKSk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGlmIGEgbGFiZWwgZXhwcmVzc2lvbiBpcyBwYXNzZWQgdGhhbiB1c2UgdGhpcyB0byBjcmVhdGUgY3VzdG9tIGxhYmVscy5cbiAgICAgICAgICAgICAgICBpZiAoYXR0ci5sYWJlbCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3RyVGVtcGxhdGUgPSBhdHRyLmxhYmVsLnJlcGxhY2UoJ1tbJywgJ3t7JykucmVwbGFjZSgnXV0nLCAnfX0nKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRlbXBsYXRlID0gJGludGVycG9sYXRlKHN0clRlbXBsYXRlKTtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUub3B0aW9ucy5mb3JFYWNoKGZ1bmN0aW9uKG9wdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9uLmxhYmVsID0gdGVtcGxhdGUob3B0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZWxlbWVudC5vbignY2hhbmdlJywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhbmd1bGFyLmlzVW5kZWZpbmVkKHNjb3BlLnByZWRpY2F0ZSkgfHwgc2NvcGUucHJlZGljYXRlID09PSAnJykge1xuICAgICAgICAgICAgICAgICAgICAgICRsb2cuZXJyb3IoJ0VtcHR5IHByZWRpY2F0ZSBub3QgYWxsb3dlZCwgYXNzaWduIGEgcHJlZGljYXRlIHZhbHVlIHRvIHN0LXNlbGVjdC1maWx0ZXIuIFVzZSBcXCckXFwnIHRvIGZpbHRlciBnbG9iYWxseS4nKTtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGFibGVDdHJsLmFwcGx5RmlsdGVyKHNjb3BlLnNlbGVjdGVkLCBzY29wZS5wcmVkaWNhdGUsIGZpbHRlcik7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLiRwYXJlbnQuJGRpZ2VzdCgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1dKTtcblxuZnVuY3Rpb24gZ2V0T3B0aW9uT2JqZWN0c0Zyb21BcnJheShvcHRpb25zKSB7XG4gICAgcmV0dXJuIG9wdGlvbnMubWFwKGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICByZXR1cm4ge2xhYmVsOiB2YWwsIHZhbHVlOiB2YWx9O1xuICAgIH0pO1xufVxuXG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcbiAgLmRpcmVjdGl2ZSgnc3RTZWxlY3RSb3cnLCBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlc3RyaWN0OiAnQScsXG4gICAgICByZXF1aXJlOiAnXnN0VGFibGUnLFxuICAgICAgc2NvcGU6IHtcbiAgICAgICAgcm93OiAnPXN0U2VsZWN0Um93J1xuICAgICAgfSxcbiAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0ciwgY3RybCkge1xuICAgICAgICB2YXIgbW9kZSA9IGF0dHIuc3RTZWxlY3RNb2RlIHx8ICdzaW5nbGUnO1xuICAgICAgICBlbGVtZW50LmJpbmQoJ2NsaWNrJywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHNjb3BlLiRhcHBseShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjdHJsLnNlbGVjdChzY29wZS5yb3csIG1vZGUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBzY29wZS4kd2F0Y2goJ3Jvdy5pc1NlbGVjdGVkJywgZnVuY3Rpb24gKG5ld1ZhbHVlKSB7XG4gICAgICAgICAgaWYgKG5ld1ZhbHVlID09PSB0cnVlKSB7XG4gICAgICAgICAgICBlbGVtZW50LmFkZENsYXNzKCdzdC1zZWxlY3RlZCcpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbGVtZW50LnJlbW92ZUNsYXNzKCdzdC1zZWxlY3RlZCcpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfTtcbiAgfSk7XG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcbiAgLmRpcmVjdGl2ZSgnc3RTb3J0JywgWyckcGFyc2UnLCBmdW5jdGlvbiAoJHBhcnNlKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlc3RyaWN0OiAnQScsXG4gICAgICByZXF1aXJlOiAnXnN0VGFibGUnLFxuICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRyLCBjdHJsKSB7XG5cbiAgICAgICAgdmFyIHByZWRpY2F0ZSA9IGF0dHIuc3RTb3J0O1xuICAgICAgICB2YXIgZ2V0dGVyID0gJHBhcnNlKHByZWRpY2F0ZSk7XG4gICAgICAgIHZhciBpbmRleCA9IDA7XG4gICAgICAgIHZhciBjbGFzc0FzY2VudCA9IGF0dHIuc3RDbGFzc0FzY2VudCB8fCAnc3Qtc29ydC1hc2NlbnQnO1xuICAgICAgICB2YXIgY2xhc3NEZXNjZW50ID0gYXR0ci5zdENsYXNzRGVzY2VudCB8fCAnc3Qtc29ydC1kZXNjZW50JztcbiAgICAgICAgdmFyIHN0YXRlQ2xhc3NlcyA9IFtjbGFzc0FzY2VudCwgY2xhc3NEZXNjZW50XTtcbiAgICAgICAgdmFyIHNvcnREZWZhdWx0O1xuXG4gICAgICAgIGlmIChhdHRyLnN0U29ydERlZmF1bHQpIHtcbiAgICAgICAgICBzb3J0RGVmYXVsdCA9IHNjb3BlLiRldmFsKGF0dHIuc3RTb3J0RGVmYXVsdCkgIT09IHVuZGVmaW5lZCA/ICBzY29wZS4kZXZhbChhdHRyLnN0U29ydERlZmF1bHQpIDogYXR0ci5zdFNvcnREZWZhdWx0O1xuICAgICAgICB9XG5cbiAgICAgICAgLy92aWV3IC0tPiB0YWJsZSBzdGF0ZVxuICAgICAgICBmdW5jdGlvbiBzb3J0KCkge1xuICAgICAgICAgIGluZGV4Kys7XG4gICAgICAgICAgcHJlZGljYXRlID0gbmcuaXNGdW5jdGlvbihnZXR0ZXIoc2NvcGUpKSA/IGdldHRlcihzY29wZSkgOiBhdHRyLnN0U29ydDtcbiAgICAgICAgICBpZiAoaW5kZXggJSAzID09PSAwICYmIGF0dHIuc3RTa2lwTmF0dXJhbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvL21hbnVhbCByZXNldFxuICAgICAgICAgICAgaW5kZXggPSAwO1xuICAgICAgICAgICAgY3RybC50YWJsZVN0YXRlKCkuc29ydCA9IHt9O1xuICAgICAgICAgICAgY3RybC50YWJsZVN0YXRlKCkucGFnaW5hdGlvbi5zdGFydCA9IDA7XG4gICAgICAgICAgICBjdHJsLnBpcGUoKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY3RybC5zb3J0QnkocHJlZGljYXRlLCBpbmRleCAlIDIgPT09IDApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGVsZW1lbnQuYmluZCgnY2xpY2snLCBmdW5jdGlvbiBzb3J0Q2xpY2soKSB7XG4gICAgICAgICAgaWYgKHByZWRpY2F0ZSkge1xuICAgICAgICAgICAgc2NvcGUuJGFwcGx5KHNvcnQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHNvcnREZWZhdWx0KSB7XG4gICAgICAgICAgaW5kZXggPSBhdHRyLnN0U29ydERlZmF1bHQgPT09ICdyZXZlcnNlJyA/IDEgOiAwO1xuICAgICAgICAgIHNvcnQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vdGFibGUgc3RhdGUgLS0+IHZpZXdcbiAgICAgICAgc2NvcGUuJHdhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gY3RybC50YWJsZVN0YXRlKCkuc29ydDtcbiAgICAgICAgfSwgZnVuY3Rpb24gKG5ld1ZhbHVlKSB7XG4gICAgICAgICAgaWYgKG5ld1ZhbHVlLnByZWRpY2F0ZSAhPT0gcHJlZGljYXRlKSB7XG4gICAgICAgICAgICBpbmRleCA9IDA7XG4gICAgICAgICAgICBlbGVtZW50XG4gICAgICAgICAgICAgIC5yZW1vdmVDbGFzcyhjbGFzc0FzY2VudClcbiAgICAgICAgICAgICAgLnJlbW92ZUNsYXNzKGNsYXNzRGVzY2VudCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluZGV4ID0gbmV3VmFsdWUucmV2ZXJzZSA9PT0gdHJ1ZSA/IDIgOiAxO1xuICAgICAgICAgICAgZWxlbWVudFxuICAgICAgICAgICAgICAucmVtb3ZlQ2xhc3Moc3RhdGVDbGFzc2VzW2luZGV4ICUgMl0pXG4gICAgICAgICAgICAgIC5hZGRDbGFzcyhzdGF0ZUNsYXNzZXNbaW5kZXggLSAxXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9LCB0cnVlKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcbiAgLmRpcmVjdGl2ZSgnc3RQYWdpbmF0aW9uJywgZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB7XG4gICAgICByZXN0cmljdDogJ0VBJyxcbiAgICAgIHJlcXVpcmU6ICdec3RUYWJsZScsXG4gICAgICBzY29wZToge1xuICAgICAgICBzdEl0ZW1zQnlQYWdlOiAnPT8nLFxuICAgICAgICBzdERpc3BsYXllZFBhZ2VzOiAnPT8nLFxuICAgICAgICBzdFBhZ2VDaGFuZ2U6ICcmJ1xuICAgICAgfSxcbiAgICAgIHRlbXBsYXRlVXJsOiBmdW5jdGlvbiAoZWxlbWVudCwgYXR0cnMpIHtcbiAgICAgICAgaWYgKGF0dHJzLnN0VGVtcGxhdGUpIHtcbiAgICAgICAgICByZXR1cm4gYXR0cnMuc3RUZW1wbGF0ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJ3RlbXBsYXRlL3NtYXJ0LXRhYmxlL3BhZ2luYXRpb24uaHRtbCc7XG4gICAgICB9LFxuICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRycywgY3RybCkge1xuXG4gICAgICAgIHNjb3BlLnN0SXRlbXNCeVBhZ2UgPSBzY29wZS5zdEl0ZW1zQnlQYWdlID8gKyhzY29wZS5zdEl0ZW1zQnlQYWdlKSA6IDEwO1xuICAgICAgICBzY29wZS5zdERpc3BsYXllZFBhZ2VzID0gc2NvcGUuc3REaXNwbGF5ZWRQYWdlcyA/ICsoc2NvcGUuc3REaXNwbGF5ZWRQYWdlcykgOiA1O1xuXG4gICAgICAgIHNjb3BlLmN1cnJlbnRQYWdlID0gMTtcbiAgICAgICAgc2NvcGUucGFnZXMgPSBbXTtcblxuICAgICAgICBmdW5jdGlvbiByZWRyYXcoKSB7XG4gICAgICAgICAgdmFyIHBhZ2luYXRpb25TdGF0ZSA9IGN0cmwudGFibGVTdGF0ZSgpLnBhZ2luYXRpb247XG4gICAgICAgICAgdmFyIHN0YXJ0ID0gMTtcbiAgICAgICAgICB2YXIgZW5kO1xuICAgICAgICAgIHZhciBpO1xuICAgICAgICAgIHZhciBwcmV2UGFnZSA9IHNjb3BlLmN1cnJlbnRQYWdlO1xuICAgICAgICAgIHNjb3BlLmN1cnJlbnRQYWdlID0gTWF0aC5mbG9vcihwYWdpbmF0aW9uU3RhdGUuc3RhcnQgLyBwYWdpbmF0aW9uU3RhdGUubnVtYmVyKSArIDE7XG5cbiAgICAgICAgICBzdGFydCA9IE1hdGgubWF4KHN0YXJ0LCBzY29wZS5jdXJyZW50UGFnZSAtIE1hdGguYWJzKE1hdGguZmxvb3Ioc2NvcGUuc3REaXNwbGF5ZWRQYWdlcyAvIDIpKSk7XG4gICAgICAgICAgZW5kID0gc3RhcnQgKyBzY29wZS5zdERpc3BsYXllZFBhZ2VzO1xuXG4gICAgICAgICAgaWYgKGVuZCA+IHBhZ2luYXRpb25TdGF0ZS5udW1iZXJPZlBhZ2VzKSB7XG4gICAgICAgICAgICBlbmQgPSBwYWdpbmF0aW9uU3RhdGUubnVtYmVyT2ZQYWdlcyArIDE7XG4gICAgICAgICAgICBzdGFydCA9IE1hdGgubWF4KDEsIGVuZCAtIHNjb3BlLnN0RGlzcGxheWVkUGFnZXMpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHNjb3BlLnBhZ2VzID0gW107XG4gICAgICAgICAgc2NvcGUubnVtUGFnZXMgPSBwYWdpbmF0aW9uU3RhdGUubnVtYmVyT2ZQYWdlcztcblxuICAgICAgICAgIGZvciAoaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICAgICAgICAgIHNjb3BlLnBhZ2VzLnB1c2goaSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHByZXZQYWdlIT09c2NvcGUuY3VycmVudFBhZ2UpIHtcbiAgICAgICAgICAgIHNjb3BlLnN0UGFnZUNoYW5nZSh7bmV3UGFnZTogc2NvcGUuY3VycmVudFBhZ2V9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvL3RhYmxlIHN0YXRlIC0tPiB2aWV3XG4gICAgICAgIHNjb3BlLiR3YXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIGN0cmwudGFibGVTdGF0ZSgpLnBhZ2luYXRpb247XG4gICAgICAgIH0sIHJlZHJhdywgdHJ1ZSk7XG5cbiAgICAgICAgLy9zY29wZSAtLT4gdGFibGUgc3RhdGUgICgtLT4gdmlldylcbiAgICAgICAgc2NvcGUuJHdhdGNoKCdzdEl0ZW1zQnlQYWdlJywgZnVuY3Rpb24gKG5ld1ZhbHVlLCBvbGRWYWx1ZSkge1xuICAgICAgICAgIGlmIChuZXdWYWx1ZSAhPT0gb2xkVmFsdWUpIHtcbiAgICAgICAgICAgIHNjb3BlLnNlbGVjdFBhZ2UoMSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBzY29wZS4kd2F0Y2goJ3N0RGlzcGxheWVkUGFnZXMnLCByZWRyYXcpO1xuXG4gICAgICAgIC8vdmlldyAtPiB0YWJsZSBzdGF0ZVxuICAgICAgICBzY29wZS5zZWxlY3RQYWdlID0gZnVuY3Rpb24gKHBhZ2UpIHtcbiAgICAgICAgICBpZiAocGFnZSA+IDAgJiYgcGFnZSA8PSBzY29wZS5udW1QYWdlcykge1xuICAgICAgICAgICAgY3RybC5zbGljZSgocGFnZSAtIDEpICogc2NvcGUuc3RJdGVtc0J5UGFnZSwgc2NvcGUuc3RJdGVtc0J5UGFnZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmKCFjdHJsLnRhYmxlU3RhdGUoKS5wYWdpbmF0aW9uLm51bWJlcil7XG4gICAgICAgICAgY3RybC5zbGljZSgwLCBzY29wZS5zdEl0ZW1zQnlQYWdlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG4gIH0pO1xuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXG4gIC5kaXJlY3RpdmUoJ3N0UGlwZScsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmVxdWlyZTogJ3N0VGFibGUnLFxuICAgICAgc2NvcGU6IHtcbiAgICAgICAgc3RQaXBlOiAnPSdcbiAgICAgIH0sXG4gICAgICBsaW5rOiB7XG5cbiAgICAgICAgcHJlOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzLCBjdHJsKSB7XG4gICAgICAgICAgaWYgKG5nLmlzRnVuY3Rpb24oc2NvcGUuc3RQaXBlKSkge1xuICAgICAgICAgICAgY3RybC5wcmV2ZW50UGlwZU9uV2F0Y2goKTtcbiAgICAgICAgICAgIGN0cmwucGlwZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLnN0UGlwZShjdHJsLnRhYmxlU3RhdGUoKSwgY3RybCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHBvc3Q6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0cnMsIGN0cmwpIHtcbiAgICAgICAgICBjdHJsLnBpcGUoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG4gIH0pO1xuIiwifSkoYW5ndWxhcik7Il0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9