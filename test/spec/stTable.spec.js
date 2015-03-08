describe('st table Controller', function () {

  var dataSet;
  var scope;
  var ctrl;
  var childScope;

  beforeEach(module('smart-table'));

  describe('with a simple data-set', function () {

    beforeEach(inject(function ($rootScope, $controller, $filter, $parse, $log) {
      dataSet = [
        {name: 'Renard', firstname: 'Laurent', age: 66},
        {name: 'Francoise', firstname: 'Frere', age: 99},
        {name: 'Renard', firstname: 'Olivier', age: 33},
        {name: 'Leponge', firstname: 'Bob', age: 22},
        {name: 'Faivre', firstname: 'Blandine', age: 44}
      ];
      scope = $rootScope;
      childScope = scope.$new();
      scope.data = dataSet;
      ctrl = $controller('stTableController', {
        $scope: scope, $parse: $parse, $filter: $filter, $log: $log, $attrs: {
          stTable: 'viewData',
          stSrc: 'data'
        }
      });

    }));

    describe('sort', function () {
      it('should sort the data', function () {
        ctrl.sortBy('firstname');
        expect(scope.viewData).toEqual([
          {name: 'Faivre', firstname: 'Blandine', age: 44},
          {name: 'Leponge', firstname: 'Bob', age: 22},
          {name: 'Francoise', firstname: 'Frere', age: 99},
          {name: 'Renard', firstname: 'Laurent', age: 66},
          {name: 'Renard', firstname: 'Olivier', age: 33}
        ]);
      });

      it('should reverse the order if the flag is passed', function () {
        ctrl.sortBy('firstname', true);
        expect(scope.viewData).toEqual([
          {name: 'Renard', firstname: 'Olivier', age: 33},
          {name: 'Renard', firstname: 'Laurent', age: 66},
          {name: 'Francoise', firstname: 'Frere', age: 99},
          {name: 'Leponge', firstname: 'Bob', age: 22},
          {name: 'Faivre', firstname: 'Blandine', age: 44}
        ]);
      });

      it('should support getter function predicate', function () {
        ctrl.sortBy(function (row) {
          return row.firstname.length;
        });
        expect(scope.viewData).toEqual([
          {name: 'Leponge', firstname: 'Bob', age: 22},
          {name: 'Francoise', firstname: 'Frere', age: 99},
          {name: 'Renard', firstname: 'Laurent', age: 66},
          {name: 'Renard', firstname: 'Olivier', age: 33},
          {name: 'Faivre', firstname: 'Blandine', age: 44}
        ]);
      });

      it('should hold the function name when using a function as predicate', function () {
        ctrl.sortBy(function firstNameLength(row) {
          return row.firstname.length;
        });

        expect(scope.viewData).toEqual([
          {name: 'Leponge', firstname: 'Bob', age: 22},
          {name: 'Francoise', firstname: 'Frere', age: 99},
          {name: 'Renard', firstname: 'Laurent', age: 66},
          {name: 'Renard', firstname: 'Olivier', age: 33},
          {name: 'Faivre', firstname: 'Blandine', age: 44}
        ]);

        expect(ctrl.tableState().sort.functionName).toBe('firstNameLength');

      });

      it('should reset the function name when sorting with something than function', function () {
        ctrl.sortBy(function firstNameLength(row) {
          return row.firstname.length;
        });
        expect(ctrl.tableState().sort.functionName).toBe('firstNameLength');
        ctrl.sortBy('name');
        expect(ctrl.tableState().sort.functionName).toBe(undefined);
        expect(ctrl.tableState().sort.predicate).toBe('name');

      });


    });

    describe('search', function () {
      it('should search based on property name ', function () {
        ctrl.search('re', 'name');
        expect(scope.viewData).toEqual([
          {name: 'Renard', firstname: 'Laurent', age: 66},
          {name: 'Renard', firstname: 'Olivier', age: 33},
          {name: 'Faivre', firstname: 'Blandine', age: 44}
        ]);
      });

      it('should not filter out null value when input is empty string', inject(function ($controller, $parse, $filter, $log) {
        scope.data = [
          {name: null, firstname: 'Laurent', age: 66},
          {name: 'Renard', firstname: 'Olivier', age: 33},
          {name: 'Faivre', firstname: 'Blandine', age: 44}
        ];

        //use another dataset for this particular spec
        ctrl = $controller('stTableController', {
          $scope: scope, $parse: $parse, $filter: $filter, $log: $log, $attrs: {
            stTable: 'viewData',
            stSrc: 'data'
          }
        });


        ctrl.search('re', 'name');
        expect(scope.viewData).toEqual([
          {name: 'Renard', firstname: 'Olivier', age: 33},
          {name: 'Faivre', firstname: 'Blandine', age: 44}
        ]);

        ctrl.search('', 'name');

        expect(scope.viewData).toEqual([
          {name: null, firstname: 'Laurent', age: 66},
          {name: 'Renard', firstname: 'Olivier', age: 33},
          {name: 'Faivre', firstname: 'Blandine', age: 44}
        ]);

      }));

      it('should search globally', function () {
        ctrl.search('re');
        expect(scope.viewData).toEqual([
          {name: 'Renard', firstname: 'Laurent', age: 66},
          {name: 'Francoise', firstname: 'Frere', age: 99},
          {name: 'Renard', firstname: 'Olivier', age: 33},
          {name: 'Faivre', firstname: 'Blandine', age: 44}
        ])
      });

      it('should add different columns', function () {
        ctrl.search('re', 'name');
        expect(scope.viewData).toEqual([
          {name: 'Renard', firstname: 'Laurent', age: 66},
          {name: 'Renard', firstname: 'Olivier', age: 33},
          {name: 'Faivre', firstname: 'Blandine', age: 44}
        ]);

        ctrl.search('re', 'firstname');

        expect(scope.viewData).toEqual([
          {name: 'Renard', firstname: 'Laurent', age: 66}
        ]);
      });

      // Almar: trimming of search string is unwanted
//      it('should trim if the input is a string', function () {
//        ctrl.search(' re', 'name');
//        expect(scope.viewData).toEqual([
//          {name: 'Renard', firstname: 'Laurent', age: 66},
//          {name: 'Renard', firstname: 'Olivier', age: 33},
//          {name: 'Faivre', firstname: 'Blandine', age: 44}
//        ]);
//      });


    });

    describe('slice', function () {
      it('should slice the collection', function () {
        ctrl.slice(1, 2);
        expect(scope.viewData.length).toBe(2);
        expect(scope.viewData).toEqual([
          {name: 'Francoise', firstname: 'Frere', age: 99},
          {name: 'Renard', firstname: 'Olivier', age: 33}
        ]);
      });

      it('limit to the last page if not enough data', function () {
        ctrl.slice(7, 2);
        expect(scope.viewData.length).toBe(1);
        expect(scope.viewData).toEqual([
          {name: 'Faivre', firstname: 'Blandine', age: 44}
        ]);
      });
    });

    describe('pipe', function () {
      it('should remembered the last slice length but start back to zero when sorting', function () {
        ctrl.slice(1, 2);
        expect(scope.viewData.length).toBe(2);
        expect(scope.viewData).toEqual([
          {name: 'Francoise', firstname: 'Frere', age: 99},
          {name: 'Renard', firstname: 'Olivier', age: 33}
        ]);

        ctrl.sortBy('firstname');
        expect(scope.viewData.length).toBe(2);
        expect(scope.viewData).toEqual([
          {name: 'Faivre', firstname: 'Blandine', age: 44},
          {name: 'Leponge', firstname: 'Bob', age: 22}
        ]);
      });

      it('should remembered the last slice length but start back to zero when filtering', function () {
        ctrl.slice(1, 2);
        expect(scope.viewData.length).toBe(2);
        expect(scope.viewData).toEqual([
          {name: 'Francoise', firstname: 'Frere', age: 99},
          {name: 'Renard', firstname: 'Olivier', age: 33}
        ]);

        ctrl.search('re', 'name');
        expect(scope.viewData.length).toBe(2);
        expect(scope.viewData).toEqual([
          {name: 'Renard', firstname: 'Laurent', age: 66},
          {name: 'Renard', firstname: 'Olivier', age: 33}
        ]);
      });

      it('should remember sort state when filtering', function () {
        ctrl.sortBy('firstname');
        expect(scope.viewData).toEqual([
          {name: 'Faivre', firstname: 'Blandine', age: 44},
          {name: 'Leponge', firstname: 'Bob', age: 22},
          {name: 'Francoise', firstname: 'Frere', age: 99},
          {name: 'Renard', firstname: 'Laurent', age: 66},
          {name: 'Renard', firstname: 'Olivier', age: 33}
        ]);

        ctrl.search('re', 'name');
        expect(scope.viewData).toEqual([
          {name: 'Faivre', firstname: 'Blandine', age: 44},
          {name: 'Renard', firstname: 'Laurent', age: 66},
          {name: 'Renard', firstname: 'Olivier', age: 33}
        ]);

      });

      it('should remember filtering when sorting', function () {
        ctrl.search('re', 'name');
        expect(scope.viewData).toEqual([
          {name: 'Renard', firstname: 'Laurent', age: 66},
          {name: 'Renard', firstname: 'Olivier', age: 33},
          {name: 'Faivre', firstname: 'Blandine', age: 44}
        ]);
        ctrl.sortBy('age');
        expect(scope.viewData).toEqual([
          {name: 'Renard', firstname: 'Olivier', age: 33},
          {name: 'Faivre', firstname: 'Blandine', age: 44},
          {name: 'Renard', firstname: 'Laurent', age: 66}
        ]);
      });
    });

    describe('select', function () {

      function getSelected(array) {
        return array.filter(function (val) {
          return val.isSelected === true;
        });
      }


      it('should select only a single row at the time', function () {
        ctrl.select(scope.viewData[3], 'single');
        var selected = getSelected(scope.viewData);
        expect(selected.length).toBe(1);
        expect(selected[0]).toEqual(scope.viewData[3]);

        ctrl.select(scope.viewData[2], 'single');

        selected = getSelected(scope.viewData);

        expect(selected.length).toBe(1);
        expect(selected[0]).toEqual(scope.viewData[2]);
      });

      it('should select a row multiple times in single mode (#165)', function () {
        ctrl.select(scope.viewData[3], 'single');
        var selected = getSelected(scope.viewData);
        expect(selected.length).toBe(1);
        expect(selected[0]).toEqual(scope.viewData[3]);

        ctrl.select(scope.viewData[3], 'single');
        selected = getSelected(scope.viewData);

        expect(selected.length).toBe(0);

        ctrl.select(scope.viewData[3], 'single');
        selected = getSelected(scope.viewData);

        expect(selected.length).toBe(1);
        expect(selected[0]).toEqual(scope.viewData[3]);
      });

      it('should select multiple row', function () {
        ctrl.select(scope.viewData[3]);
        ctrl.select(scope.viewData[4]);
        var selected = getSelected(scope.viewData);
        expect(selected.length).toBe(2);
        expect(selected).toEqual([scope.viewData[3], scope.viewData[4]]);
      });

      it('should unselect an item on mode single', function () {
        ctrl.select(scope.viewData[3], 'single');
        var selected = getSelected(scope.viewData);
        expect(selected.length).toBe(1);
        expect(selected[0]).toEqual(scope.viewData[3]);

        ctrl.select(scope.viewData[3], 'single');

        selected = getSelected(scope.viewData);

        expect(selected.length).toBe(0);
      });

      it('should unselect an item on mode multiple', function () {
        ctrl.select(scope.viewData[3]);
        ctrl.select(scope.viewData[4]);
        var selected = getSelected(scope.viewData);
        expect(selected.length).toBe(2);
        expect(selected).toEqual([scope.viewData[3], scope.viewData[4]]);

        ctrl.select(scope.viewData[3]);
        selected = getSelected(scope.viewData);
        expect(selected.length).toBe(1);
        expect(selected).toEqual([scope.viewData[4]]);
      });
    });
  });
});
