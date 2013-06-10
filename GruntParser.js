define(function(require, exports, module){
    function noop() {}
    function parse(gruntfileText) {
        var targets = ['default'],
            module = {},
            config;
        // Yes, we're just going to eval the entire Gruntfile.
        // Get over it.
        eval(gruntfileText);
        var gruntShim = {
            initConfig: function(_config) {
                config = _config;
            },
            registerTask: noop,
            registerMultiTask: noop,
            renameTask: noop,
            loadTasks: noop,
            loadNpmTasks: noop,
            warn: noop,
            fatal: noop
        };
        // After eval'ing the Gruntfile text, module.exports should be a function
        // that takes a 'grunt' argument
        try {
            module.exports(gruntShim);
        }
        catch (exception) {
            // It's likely going to fail, 
            // but should have done enough...
        }
        if (!config) {
            console.log("Failed to parse grunt config");
            return null;
        }
        for (var task in config) {
            targets.push(task);
            for (var subTask in config[task]) {
                targets.push(task + ":" + subTask);
            }
        }
        return targets;
    }
    exports.parse = parse;
});