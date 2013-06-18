/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, browser: true */
/*global $, define, brackets */

define(function (require, exports, module) {
    "use strict";
    
    var AppInit             = brackets.getModule("utils/AppInit"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        Commands            = brackets.getModule("command/Commands"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        FileIndexManager    = brackets.getModule("project/FileIndexManager"),
        FileUtils           = brackets.getModule("file/FileUtils"),
        Menus               = brackets.getModule("command/Menus"),
        NativeFileSystem    = brackets.getModule("file/NativeFileSystem").NativeFileSystem,
        NodeConnection      = brackets.getModule("utils/NodeConnection"),
        PanelManager        = brackets.getModule("view/PanelManager"),
        ProjectManager      = brackets.getModule("project/ProjectManager");
    
    var RUN_BUILD           = "grunt_build_cmd";
    var SHOW_ANT_PANEL      = "show_grunt_panel_cmd";
    var nodeConnection;
    
    var PROJECT_MENU        = "project-menu",
        PROJECT_MENU_NAME   = "Project",
        GRUNT_DEFAULT       = "project-grunt-default";
    
    var contextMenu         = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU),
        projectMenu,
        gruntFile,
        defaultMenuItem,
        gruntDefaultCommand,
        gruntMenuItems           = [],
        buildMenuItem       = null,
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
    
    function _loadGruntTasks() {
        function loadTargets(targets) {
            $.each(targets, function (index, target) {
                var id = RUN_BUILD + target.replace(":","-");
                if (!CommandManager.get(id)) {
                    CommandManager.register("Grunt " + target, id, function () {
                        _runBuild(target);
                    });
                }
                
                projectMenu.addMenuItem(id, "", Menus.LAST);
                gruntMenuItems.push(id);
            });
            
        }
        
        function getGruntFile(directory) {
            directory.getFile("Gruntfile.js", {create: false, exclusive: false},
                              function (file) {
                                  gruntFile = file;
                                  gruntDefaultCommand.setEnabled(true);
                                  _loadGruntfile(file).done(loadTargets);
                              },
                              function (error) {
                                  gruntFile = undefined;
                                  gruntDefaultCommand.setEnabled(false);
                              });
        }
        
        _removeAllProjectMenuItems();
        gruntMenuItems = [];
        var root = ProjectManager.getProjectRoot();
        NativeFileSystem.resolveNativeFileSystemPath(root.fullPath, getGruntFile);
    }
    
    function _initializeTopMenu() {
        projectMenu = Menus.getMenu(PROJECT_MENU);
        if (projectMenu) {
            projectMenu.addMenuDivider();
        } else {
            projectMenu = Menus.addMenu(PROJECT_MENU_NAME, PROJECT_MENU, Menus.AFTER, Menus.AppMenuBar.NAVIGATE_MENU);
        }
        gruntDefaultCommand = CommandManager.register("Grunt default", GRUNT_DEFAULT, function () {
                            _runBuild();
                        });
        defaultMenuItem = projectMenu.addMenuItem(GRUNT_DEFAULT, "F6");
        
        _loadGruntTasks();
        $(ProjectManager).on("projectOpen", function() {
            _loadGruntTasks();
        });
        $(ProjectManager).on("projectFilesChanged", function() {
            _loadGruntTasks();
        });
    }
    
    AppInit.appReady(function () {
        
        _initializeTopMenu();
        
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
            $("#grunt .table-container").append($("<p>" + data + "</p>"));
        });

        chain(connect, loadGruntDomain);
    });

    AppInit.htmlReady(function () {

        //add the HTML UI
        var content =          '  <div id="grunt" class="bottom-panel">'
                             + '  <div class="toolbar simple-toolbar-layout">'
                             + '    <div class="title">Grunt</div><a href="#" class="close">&times;</a>'
                             + '  </div>'
                             + '  <div id="grunt-panel" class="table-container" style="padding: 4px; overflow: scroll"/>'
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
        var entry   = gruntFile,
            path    = entry.fullPath.substring(0, entry.fullPath.lastIndexOf("/")),
            file    = entry.name;
        
        CommandManager.execute(Commands.FILE_SAVE_ALL);
        $grunt.show();
        var $output = $("#grunt .table-container");
        $output.empty().append($("<p>Running...</p>"));
        _loadGruntfile(entry).done(function () {
            nodeConnection.domains.grunt.build(path, target)
                .fail(function (err) {
                    console.error("[brackets-grunt] failed to run grunt", err);
                    $output.append($("<p>Failed to run grunt; error code " + err.code + "</p>"));
                })
                .done(function (result) {
                    result = result.replace(/\r?\n/mg, "<br />", "mg");
                    $output.empty().append($("<p>" + result + "</p>"));
                    $output.scrollTop($output[0].scrollHeight);
                });
        }).fail(function (err) {
            console.log(err);
        });
    }
    
    function _removeAllContextMenuItems() {
        $.each(gruntMenuItems, function (index, target) {
            contextMenu.removeMenuItem(target);
        });
    }
    
    function _removeAllProjectMenuItems() {
        $.each(gruntMenuItems, function (index, target) {
            projectMenu.removeMenuItem(target);
        });
    }
        
    $(contextMenu).on("beforeContextMenuOpen", function (evt) {        
        var selectedEntry = ProjectManager.getSelectedItem();
        console.log(selectedEntry);
        
        _removeAllContextMenuItems();
        
        if (_isGruntfile(selectedEntry)) {
            contextMenu.addMenuItem(gruntDefaultCommand, "", Menus.LAST);
            $.each(gruntMenuItems, function (index, target) {
                contextMenu.addMenuItem(target, "", Menus.LAST);
            });
            contextMenu.addMenuItem(Menus.DIVIDER, "", Menus.LAST);
        }
    });
    
});