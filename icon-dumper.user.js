// ==UserScript==
// @name       Battlescreen Icon ID dumper
// @description Basic utility plugin for Vehicle Respawn Timer for adding or updating icon ID's of vehicles
// @version    0.1
// @match      http://battlelog.battlefield.com/bf4/battlescreen/*
// ==/UserScript==
(function() {
    var foundIcons = [];
    $(".uioverlaysectionleft").append("<div id='found_icons' class='uioverlaygroup' style='max-width:300px;'></div>");
    bs.connection.addEventListener("recv", function(newState) {
        BattleScreen.prototype.onRecv.apply(bs, arguments);
        if (newState.type == "vehicles") {
            for (var i = 0; i < newState.icon.length; i++) {
                if (foundIcons.indexOf(newState.icon[i]) == -1) {
                    foundIcons.push(newState.icon[i]);
                    var subIcon = bs.getSubIcon(newState.icon[i], TEAMSTATE_NEUTRAL, 0);
                    if (subIcon) {
                        var canvas = document.createElement("canvas");
                        canvas.width = subIcon.width;
                        canvas.height = subIcon.height;
                        var ctx = canvas.getContext("2d");
                        ctx.drawImage(subIcon.image, subIcon.x, subIcon.y, subIcon.width, subIcon.height, 0, 0, subIcon.width, subIcon.height);
                        $("#found_icons").append("<span>" + newState.icon[i] + "</span><img src='" + canvas.toDataURL() + "'>");
                    }
                }
            }
        }
    }.bind(this));
}());