// ==UserScript==
// @name        Battlescreen Vehicle Respawn Timer
// @description Displays vehicle respawn time on Battlescreen
// @author      Andersso
// @version     0.4
// @match       http://battlelog.battlefield.com/bf4/*
// @grant       none
// ==/UserScript==
(function() {
    // Modification of jsdiff by Kevin Decker
    // Source: https://github.com/kpdecker/jsdiff
    var jsDiff = (function() {
        var clonePath = function(path) {
            return {
                newPos: path.newPos,
                components: { added: path.components.added.slice(0), removed: path.components.removed.slice(0), existing: path.components.existing.slice(0) }
            };
        };
        var extractCommon = function(basePath, newArray, oldArray, diagonalPath) {
            var newLen = newArray.length, oldLen = oldArray.length,
                newPos = basePath.newPos, oldPos = newPos - diagonalPath;
            while (newPos <= newLen && oldPos + 1 < oldLen && newArray[newPos + 1] == oldArray[oldPos + 1]) {
                basePath.components.existing.push({ oldPos: ++oldPos, newPos: ++newPos });
            }
            basePath.newPos = newPos;
            return oldPos;
        };
        return {
            diff: function(oldArray, newArray) {
                var newLen = newArray.length, oldLen = oldArray.length, maxEditLength = newLen + oldLen,
                    bestPath = [{ newPos: -1, components: { added: [], removed: [], existing: [] }}],
                    oldPos = extractCommon(bestPath[0], newArray, oldArray, 0);
                if (oldPos + 1 >= oldLen) {
                    return bestPath[0].components;
                }
                for (var editLength = 1; editLength <= maxEditLength; editLength++) {
                    for (var diagonalPath = -1 * editLength; diagonalPath <= editLength; diagonalPath += 2) {
                        var basePath,addPath = bestPath[diagonalPath - 1], removePath = bestPath[diagonalPath + 1];
                        oldPos = (removePath ? removePath.newPos : 0) - diagonalPath;
                        if (addPath) {
                            bestPath[diagonalPath - 1] = undefined;
                        }
                        var canAdd = addPath && addPath.newPos <= newLen, canRemove = removePath && oldPos >= 0 && oldPos < oldLen;
                        if (!canAdd && !canRemove) {
                            bestPath[diagonalPath] = undefined;
                            continue;
                        }
                        if (!canAdd || (canRemove && addPath.newPos < removePath.newPos)) {
                            basePath = clonePath(removePath);
                            if (oldArray[oldPos] != undefined) {
                                basePath.components.removed.push(oldPos);
                            }
                        } else {
                            basePath = clonePath(addPath);
                            basePath.newPos++;
                            basePath.components.added.push(basePath.newPos);
                        }
                        oldPos = extractCommon(basePath, newArray, oldArray, diagonalPath);
                        if (basePath.newPos + 1 >= newLen && oldPos + 1 >= oldLen) {
                            return basePath.components;
                        } else {
                            bestPath[diagonalPath] = basePath;
                        }
                    }
                }
            }
        };
    }());
    (function() {
        var _this = this;
        this.settings = {
            enabled: true,
            enabledVehicles: [true, true, true, true, true, true, true, true, true, true, true]
        };
        $.extend(this.settings, JSON.parse(Surface.cookieGet("respawnTimerSettings") || "null"));
        this.vehicleInfo = [
            { displayName: "Tank",             iconId: 3715700347, respawnTime: 90000 },
            { displayName: "IFV",              iconId: 1870125354, respawnTime: 90000 },
            { displayName: "Anti-Air",         iconId: 2077838283, respawnTime: 90000 },
            { displayName: "Mobile Artillery", iconId: 3138927120, respawnTime: 90000 },
            { displayName: "AMTRAC",           iconId: 2800623557, respawnTime: 90000 },
            { displayName: "Stealth Jet",      iconId: 2303933806, respawnTime: 90000 },
            { displayName: "Attack Jet",       iconId: 2421515579, respawnTime: 90000 },
            { displayName: "Attack Heli",      iconId: 1002462244, respawnTime: 90000 },
            { displayName: "Scout Heli",       iconId: 738928977,  respawnTime: 60000 },
            { displayName: "Transport Heli",   iconId: 3146048021, respawnTime: 60000 },
            { displayName: "Attack Craft",     iconId: 1385519273, respawnTime: 90000 }
        ];
        this.resetRespawnTimer = function () {
            this.lastX = [];
            this.lastY = [];
            this.lastIcon = [];
            this.lastTeam = [];
            this.vehicleRespawns = [];
        };
        this.attachRespawnTimer = function() {
            this.friendName = undefined;
            this.respawnDelay = 1.0;
            this.resetRespawnTimer();
            bs.connection.addEventListener("connect", function() {
                BattleScreen.prototype.onConnect.apply(bs, arguments);
                var userPresence = Surface.globalContext.session.user.presence;
                // Get respawn delay from server page
                $.ajax({
                    url: Surface.valOut(S.Modifier.urlformat("/{_section}/{_language}/servers/show/{platform}/{guid}/{slug}/", Surface.urlContext, {
                    "guid":     userPresence.playingMp.serverGuid,
                    "platform": S.Modifier.lower($S.callFunction("base.platform", userPresence.playingMp.platform)),
                    "slug":     S.Modifier.slugify(userPresence.playingMp.serverName)
                })),
                beforeSend: function(xmlHttpRequest, settings) {
                    xmlHttpRequest.setRequestHeader("X-AjaxNavigation", "1");
                },
                success: function(data) {
                    _this.respawnDelay = data.context.server.settings.vvsd / 100;
                }
                });
            }.bind(this));
            bs.connection.addEventListener("disconnect", function() {
                BattleScreen.prototype.onDisconnect.apply(bs, arguments);
                $("#respawn-timer").hide();
                this.resetRespawnTimer();
            }.bind(this));
            bs.connection.addEventListener("recv", function(newState) {
                BattleScreen.prototype.onRecv.apply(bs, arguments);
                if (newState.type == "vehicles") {
                    var currentTime = Date.now(),
                        result = jsDiff.diff(this.lastIcon, newState.icon);
                    for (var i = 0; i < result.added.length; i++) {
                        var index = result.added[i];
                        if (newState.teamstate[index] == TEAMSTATE_TEAM || newState.teamstate[index] == TEAMSTATE_SQUAD || newState.teamstate[index] == TEAMSTATE_NEUTRAL) {
                            var bestVehicle = -1, bestScore = 999999;
                            for (var x = this.vehicleRespawns.length; x--; x) {
                                if (newState.icon[index] == this.vehicleRespawns[x].vehicleType) {
                                    var dX = Math.abs(newState.x[index] - this.vehicleRespawns[x].lastX),
                                        dY = Math.abs(newState.y[index] - this.vehicleRespawns[x].lastY),
                                        distance = dX * dX + dY * dY;
                                    if (distance < 2500) { // TODO: calculate a good minimum distance.
                                        // Score is calculated to find the vehicle with the best distance to index ratio.
                                        var score = (Math.abs(index - this.vehicleRespawns[x].lastIndex) + 1) / distance;
                                        if (score < bestScore) {
                                            bestVehicle = x;
                                            bestScore = score;
                                        }
                                    }
                                }
                            }
                            if (bestVehicle != -1) {
                                console.log("found missing vehicle: " + this.vehicleRespawns[bestVehicle].vehicleType + " score: " + bestScore);
                                this.vehicleRespawns.splice(bestVehicle, 1);
                            }
                        }
                    }
                    for (var i = 0; i < result.existing.length; i++) {
                        var newIndex = result.existing[i].newPos;
                        if (newState.teamstate[newIndex] == TEAMSTATE_NEUTRAL) {
                            var oldIndex = result.existing[i].oldPos;
                            if (this.lastTeam[oldIndex] == TEAMSTATE_TEAM || this.lastTeam[oldIndex] == TEAMSTATE_SQUAD || this.lastTeam[oldIndex] == -1) {
                                newState.teamstate[newIndex] = -1;
                            }
                        }
                    }
                    var vehicleAdded = false;
                    for (var i = 0; i < result.removed.length; i++) {
                        var index = result.removed[i];
                        if (this.lastTeam[index] == -1) {
                            for (var x = 0; x < this.vehicleInfo.length; x++) {
                                if (this.lastIcon[index] == this.vehicleInfo[x].iconId && this.settings.enabledVehicles[x]) {
                                    var y, respawnTime = currentTime + this.vehicleInfo[x].respawnTime * this.respawnDelay;
                                    for (y = 0; y < this.vehicleRespawns.length; y++) {
                                        if (respawnTime <= this.vehicleRespawns[y].respawnTime) {
                                            break;
                                        }
                                    }
                                    this.vehicleRespawns.splice(y, 0, { vehicleType: x, lastIndex: index, lastX: this.lastX[index], lastY: this.lastY[index], respawnTime: respawnTime });
                                    vehicleAdded = true;
                                }
                            }
                        }
                    }
                    if (vehicleAdded) {
                        this.refreshSpawnList();
                        this.refreshRespawnTime();
                    } else if (!this.vehicleRespawns.length) {
                        $("#timer-list").hide();
                    }
                    this.lastX = newState.x.slice(0);
                    this.lastY = newState.y.slice(0);
                    this.lastIcon = newState.icon.slice(0);
                    this.lastTeam = newState.teamstate.slice(0);
                } else if (newState.type == "minimapimage") {
                    if (newState.dataURL.length) {
                        $("#respawn-timer").show();
                    } else {
                        $("#respawn-timer").hide();
                         this.resetRespawnTimer();
                    }
                // Reset if the player has switched team
                } else if (newState.type == "tickets") {
                    if (!newState.friendTickets || !newState.enemyTickets || (this.friendName && this.friendName != newState.friendName)) {
                         this.resetRespawnTimer();
                    }
                    this.friendName = newState.friendName;
                }
            }.bind(this));
            this.refreshSpawnList = function() {
                var c = [];
                for (var i = 0; i < this.vehicleRespawns.length; i++) {
                    c.push("<dl>\n <dt>\n ");
                    c.push(this.vehicleInfo[this.vehicleRespawns[i].vehicleType].displayName);
                    c.push("</dt>\n <dd>\n </dd>\n </dl>\n ");
                }
                $("#timer-list").html(c.join("")).show();
            };
            this.refreshRespawnTime = function() {
                var elements = $("#timer-list dl dd"), currentTime = Date.now();
                for (var i = this.vehicleRespawns.length; i--; i) {
                    if (this.vehicleRespawns[i].respawnTime <= currentTime) {
                        _this.vehicleRespawns.splice(i, 1);
                        $(elements[i]).parent().remove();
                    } else {
                        var timeLeft = Math.floor((this.vehicleRespawns[i].respawnTime - currentTime) / 1000);
                        $(elements[i]).text(timeLeft).css("color", timeLeft <= 15 ? timeLeft <= 10 ? "red" : "yellow" : "white");
                    }
                }
            };
            this.timer_refreshRespawnTime = function() {
                this.refreshRespawnTime();
                setTimeout(this.timer_refreshRespawnTime.bind(this), 1000);
            };
            this.timer_refreshRespawnTime();
            var c = [];
            c.push('<div class="uioverlaysectionright">\n ');
            c.push('<div class="uioverlaygroup">\n ');
            c.push('<div class="box" id="respawn-timer">\n ');
            c.push('<header>\n <p>Estimated Respawns</p>\n </header>\n ');
            c.push('<div class="box-content" id="timer-list"></div>\n </div>\n </div>\n </div>\n ');
            $("#uioverlay").append(c.join(""));
        };
        this.detachRespawnTimer = function() {
            this.resetRespawnTimer();
            if (bs) {
                bs.connection.addEventListener("recv", bs.onRecv.bind(bs));
                bs.connection.addEventListener("connect", bs.onConnect.bind(bs));
                bs.connection.addEventListener("disconnect", bs.onDisconnect.bind(bs));
            }
        };
        this.writeOption = function(c, name, label, checked) {
            c.push('<div>\n <div class="switch">\n <input type="checkbox" ');
            if (checked) {
                c.push('checked="yes" ');
            }
            c.push('class="profile-edit-checkbox" name="');
            c.push(name);
            c.push('">\n <div class="handle">\n </div>\n </div>\n <label>');
            c.push(label);
            c.push("</label>\n </div>\n ");
        };
        this.injectProfileSettings = function() {
            var c = [];
            c.push('<fieldset class="box-content inline">\n <div class="profile-edit-row" id="respawn-timer-settings">\n <label>Respawn Timer</label>\n <div>\n ');
            this.writeOption(c, "enabled", "Enabled", this.settings.enabled);
            c.push('<p>Vehicles</p>\n ');
            for (var i = 0; i < this.vehicleInfo.length; i++) {
                this.writeOption(c, "enabledVehicles", this.vehicleInfo[i].displayName, this.settings.enabledVehicles[i]);
            }
            c.push("</div>\n </div>\n </fieldset>");
            $("#profile-edit-full-form").on("submit", function(e) {
                for (var property in _this.settings) {
                    var input = $(this).find("input[name='" + property + "']");
                    if (_this.settings[property] instanceof Array) {
                        _this.settings[property] = [];
                        input.each(function() {
                            _this.settings[property].push($(this).prop("checked"));
                        });
                    } else {
                        _this.settings[property] = input.prop("checked");
                    }
                }
                Surface.cookieSet("respawnTimerSettings", JSON.stringify(_this.settings));
            }).find("div.margin-top.margin-bottom.pull-right").before(c.join(""));
        };
        this.injectStyle = function() {
            var c = [];
            c.push('<style id="bob" type="text/css">\n ');
            c.push("#respawn-timer {\n cursor: default;\n width: 180px;\n margin: 10px;\n display: none;\n }\n ");
            c.push("#respawn-timer > header {\n background-color: white;\n }\n ");
            c.push("#respawn-timer > header > p {\n padding: 5px 0px;\n text-align: center;\n color:black;\n letter-spacing: 0.027em;\n }\n ");
            c.push("#timer-list {\n padding: 0px 5px 5px 5px;\n display: none;\n }\n ");
            c.push("#timer-list dl {\n padding-bottom: 20px;\n margin-top: 5px;\n border-bottom: 1px solid rgba(255,255,255,0.5);\n }\n ");
            c.push("#timer-list dt {\n float: left;\n }\n ");
            c.push("#timer-list dd {\n float: right;\n }\n ");
            c.push("#respawn-timer-settings > div {\n float: left;\n }\n ");
            c.push("#respawn-timer-settings > div > div {\n margin:3px 0;\n }\n ");
            c.push("#respawn-timer-settings > div > p {\n margin-top: 10px;\n font-size: 9pt;\n text-transform: uppercase;\n font-weight: bold;\n }\n ");
            c.push("</style>\n ");
            $("head").append(c.join(""));
        };
        this.injectStyle();
        $(document).on("pageshow.global", this.onPageShow = function() {
            var componentName = Surface.globalContext.componentName;
            if (componentName == "battlescreen" && _this.settings.enabled) {
                _this.attachRespawnTimer();
            } else if (componentName == "profile" && Surface.globalContext.activeUserPage == "edit-notifications") {
                _this.injectProfileSettings();
            }
        }).on("pageleave.global", function() {
            var componentName = Surface.globalContext.componentName;
            if (componentName == "battlescreen") {
                _this.detachRespawnTimer();
            }
        });
        this.onPageShow();
    }());
}());
