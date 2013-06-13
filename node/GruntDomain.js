/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, node: true */
/*global brackets */

(function () {
    
    "use strict";
    
    var _domainManager = null;
    
    /**
     * 
     */
    function cmdBuild(path, task, callback) {
        var exec    = require('child_process').exec,
            fs      = require('fs'),
            tmp     = "~grunt.tmp",
            cmd     = "grunt --no-color " + (task || "") + " >" + tmp,
            child;

        if (path) {
            process.chdir(path);
        }
        
        child = exec(cmd, function (error, stdout, stderr) {
            fs.readFile(tmp, function (error, data) {
                fs.unlink(tmp);
                callback(error, data.toString());
            });
        });
        
        child.stdout.on("data", function (data) {
            _domainManager.emitEvent("grunt", "update", [data]);
        });
    }
    
    /**
     *
     */
    function init(domainManager) {
        _domainManager = domainManager;
        
        if (!_domainManager.hasDomain("grunt")) {
            _domainManager.registerDomain("grunt", {major: 0, minor: 1});
        }
        
        _domainManager.registerCommand(
            "grunt",
            "build",
            cmdBuild,
            true,
            "Runs a grunt task",
            ["path", "task"],
            [{name: "result",
                type: "string",
                description: "The result of the execution"}]
        );
        
        _domainManager.registerEvent(
            "grunt",
            "update",
            [{name: "data", type: "string"}]
        );
    }
    
    exports.init = init;
    
}());