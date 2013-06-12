/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, browser: true */
/*global $, define, brackets */

define(function (require, exports, module) {
    "use strict";
    
    var AppInit             = brackets.getModule("utils/AppInit"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        FileIndexManager    = brackets.getModule("project/FileIndexManager"),
        FileUtils           = brackets.getModule("file/FileUtils"),
        Menus               = brackets.getModule("command/Menus"),
        NativeFileSystem    = brackets.getModule("file/NativeFileSystem"),
        NodeConnection      = brackets.getModule("utils/NodeConnection"),
        PanelManager        = brackets.getModule("view/PanelManager"),
        ProjectManager      = brackets.getModule("project/ProjectManager");
    
    var RUN_BUILD       = "grunt_build_cmd";
    var SHOW_ANT_PANEL  = "show_grunt_panel_cmd";
    var nodeConnection;
    
    var contextMenu     = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU),
        menuItems       = [],
        buildMenuItem   = null,
        $grunt;
    
    var gruntParser = require("GruntParser");
    
    // Helper function that chains a series of promise-returning
    // functions together via their done callbacks.
    function chain() {
        var functions = Array.prototype.slice.call(arguments, 0);
        if (functions.length > 0) {
            var firstFunction = functions.shift();
            var firstPromise = firstFunction.call();
            firstPromise.done(function () {
                chain.apply(null, functions);
            });
        }
    }
    
    AppInit.appReady(function () {
        
        nodeConnection = new NodeConnection();
        
        // Helper function that tries to connect to node
        function connect() {
            var connectionPromise = nodeConnection.connect(true);
            
            connectionPromise.fail(function () {
                console.error("[brackets-grunt] failed to connect to node");
            });
            
            return connectionPromise;
        }
        
        // Helper function that loads our domain into the node server
        function loadGruntDomain() {
            var path        = ExtensionUtils.getModulePath(module, "node/GruntDomain"),
                loadPromise = nodeConnection.loadDomains([path], true);
            
            loadPromise.fail(function () {
                console.log("[brackets-grunt] failed to load Grunt domain");
            });
            
            return loadPromise;
        }
        
        $(nodeConnection).on("grunt.update", function (evt, data) {
            console.log(data);
            $("#grunt .grunt-container").append($("<p>" + data + "</p>"));
        });

        chain(connect, loadGruntDomain);
    });

    AppInit.htmlReady(function () {

        //add the HTML UI
        var content =          '  <div id="grunt" class="bottom-panel">'
                             + '  <div class="toolbar simple-toolbar-layout">'
                             + '    <div class="title">Grunt</div><a href="#" class="close">&times;</a>'
                             + '  </div>'
                             + '  <div class="grunt-container" style="padding: 4px"/>'
                             + '</div>';

        $grunt = PanelManager.createBottomPanel("grunt.display.grunt",$(content),200);

        $('#grunt .close').click(function () {
            $grunt.hide();
        });
    });
    
    function _isGruntfile(fileEntry) {
        return fileEntry && fileEntry.name.toLowerCase() === "gruntfile.js";
    }
    
    function _loadGruntfile(fileEntry) {        
        var checkBuildPromise = new $.Deferred();
        
        FileUtils.readAsText(fileEntry).done(function (rawText) {
            var targets = gruntParser.parse(rawText);
            if (targets && targets.length) {
                checkBuildPromise.resolve(targets);
            } else {
                checkBuildPromise.reject();
            }
        }).fail(function (err) {
            checkBuildPromise.reject(err);
        });
        
        return checkBuildPromise.promise();
    }
    
    // 
    function _runBuild(target) {
        var entry   = ProjectManager.getSelectedItem(),
            path    = entry.fullPath.substring(0, entry.fullPath.lastIndexOf("/")),
            file    = entry.name;
        
        $grunt.show();
        $("#grunt .grunt-container").empty().append($("<p>Running Grunt...</p>"));
        _loadGruntfile(entry).done(function () {
            nodeConnection.domains.grunt.build(path, target)
                .fail(function (err) {
                    console.error("[brackets-grunt] failed to run grunt", err);
                    $("#grunt .grunt-container").append($("<p>Failed to run grunt; error code " + err.code + "</p>"));
                })
                .done(function (result) {
                    console.log("[brackets-grunt] (%s)", result);
                    $("#grunt .grunt-container").append($("<p>Grunt completed successfully.</p>"));
                });
        }).fail(function (err) {
            console.log(err);
        });
    }
    
    function _showAntPanel() {
        FileIndexManager.getFileInfoList("all")
            .done(function (fileListResult) {
                console.log(fileListResult);
            });
    }
    
    function _removeAllContextMenuItems() {
        $.each(menuItems, function (index, target) {
            contextMenu.removeMenuItem(target);
        });
    }
        
    $(contextMenu).on("beforeContextMenuOpen", function (evt) {
        
        var selectedEntry = ProjectManager.getSelectedItem();
        
        _removeAllContextMenuItems();
        
        if (_isGruntfile(selectedEntry)) {
            _loadGruntfile(selectedEntry).done(function (targets) {
                $.each(targets, function (index, target) {
                    var id = RUN_BUILD + target.replace(":","-");
                    if (!CommandManager.get(id)) {
                        CommandManager.register("Build " + target + "...", id, function () {
                            _runBuild(target);
                        });
                    }
                    
                    contextMenu.addMenuItem(id, "", Menus.LAST);
                    menuItems.push(id);
                });
            });
        }
    });
    
    contextMenu.addMenuItem(Menus.DIVIDER, "", Menus.LAST);
});