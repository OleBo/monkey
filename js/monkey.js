/**
 * Copyright (c) 2008 Andreas Blixt <andreas@blixt.org>
 * Project homepage: <http://code.google.com/p/monkey-web/>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var ServiceClient = new Class({
    initialize: function (path) {
        this._path = path;
        this._queue = [];
        this._running = false;
    },
    
    call: function (action, args, onSuccess, onError) {
        if (this._running == true) {
            this._queue.push([action, args, onSuccess]);
            return;
        }

        this._running = true;

        var params = { _time: +new Date() };
        $each(args, function (v, p) {
            params[p] = JSON.encode(v);
        });

        var sc = this;
        var req = new Request.JSON({
            secure: false,
            url: sc._path + action,
            onComplete: function (result) {
                if (result === undefined) {
                    alert('An error occurred during the request. Try again.');
                } else {
                    switch (result.status) {
                        case 'error':
                            if (onError)
                                onError(result.response);
                            else
                                alert(result.response.type + ': ' + result.response.message);
                            break;
                        case 'list':
                            break;
                        case 'success':
                            if (onSuccess) onSuccess(result.response);
                            break;
                        default:
                            alert('Unknown status: ' + result.status);
                            break;
                    }
                }

                sc._running = false;
                if (sc._queue.length > 0) {
                    sc.call.apply(sc, sc._queue.shift());
                }
            }
        }).get(params);
    }
});

var MonkeyService = new Class({
    Extends: ServiceClient,

    initialize: function () {
        this.parent('/game/');
    },

    createGame: function (ruleSetId, onSuccess, onError) {
        this.call('create', { rule_set_id: ruleSetId }, onSuccess, onError);
    },

    gameStatus: function (gameId, turn, onSuccess, onError) {
        this.call('status', { game_id: gameId, turn: turn }, onSuccess, onError);
    },
    
    getRuleSets: function (onSuccess, onError) {
        this.call('rule_sets', {}, onSuccess, onError);
    },

    joinGame: function(gameId, onSuccess, onError) {
        this.call('join', { 'game_id': gameId }, onSuccess, onError);
    },
    
    leaveGame: function (gameId, onSuccess, onError) {
        this.call('leave', { 'game_id': gameId }, onSuccess, onError);
    },

    listGames: function (onSuccess, onError) {
        this.call('list', {}, onSuccess, onError);
    },
    
    move: function (gameId, x, y, onSuccess, onError) {
        this.call('move', { game_id: gameId, 'x': x, 'y': y }, onSuccess, onError);
    }
});

var MonkeyClient = new Class({
    initialize: function () {
        var mc = this;

        mc.gameId = null;
        mc.service = new MonkeyService();
        mc.turn = null;

        var ruleSets;

        mc.html = {};
        $extend(mc.html, {
            game: new Element('div', {
                'class': 'game'
            }).adopt(
                mc.html.gameStatus = new Element('p'),
                mc.html.players = new Element('ol', { 'class': 'players' }),
                new Element('p').adopt(
                    mc.html.joinOrLeave = new Element('button', {
                        text: '...'
                    }),
                    new Element('button', {
                        events: { click: mc.setMode.bind(mc, MonkeyClient.Mode.lobby) },
                        text: 'To the lobby'
                    })
                ),
                new Element('table').adopt(
                    mc.html.gameBoard = new Element('tbody')
                )
            ),

            main: new Element('div', { 'class': 'monkey' }).inject('body'),

            lobby: new Element('div', {
                'class': 'lobby'
            }).adopt(
                new Element('p').adopt(
                    ruleSets = new Element('select'),
                    new Element('button', {
                        events: {
                            click: function () { mc.createGame(parseInt(ruleSets.value)); }
                        },
                        text: 'Create game'
                    })
                ),
                new Element('table').adopt(
                    new Element('thead').adopt(
                        new Element('tr').adopt(
                            new Element('th', {
                                'class': 'action',
                                text: 'View/Play'
                            }),
                            new Element('th', {
                                'class': 'rule-set',
                                text: 'Rule set'
                            }),
                            new Element('th', {
                                'class': 'players',
                                text: 'Players'
                            })
                        )
                    ),
                    mc.html.gameList = new Element('tbody')
                )
            )
        });

        mc.service.getRuleSets(function (list) {
            mc.ruleSets = {};
            for (var i = 0; i < list.length; i++) {
                mc.ruleSets[list[i].id] = list[i].name;
                new Element('option', { text: list[i].name, value: list[i].id }).inject(ruleSets);
            }
            ruleSets.value = list[0].id;
        });

        mc.setMode(MonkeyClient.Mode.lobby);
    },
    
    createGame: function (ruleSetId) {
        this.service.createGame(ruleSetId, this.goToGame.bind(this));
    },
    
    goToGame: function (gameId) {
        this.gameId = gameId;
        this.setMode(MonkeyClient.Mode.game);
    },
    
    handleList_playerTd: function (index, game) {
        if (game.players[index]) {
            var turn = game.state == 'playing' && game.current_player == index + 1;
            return new Element('td', {
                'class': 'slot',
                text: game.players[index] + (turn ? ' ←' : '')
            });
        } else {
            return new Element('td', {
                'class': 'open slot'
            }).adopt(
                new Element('a', {
                    events: { click: this.joinGame.bind(this, game.id) },
                    href: '#',
                    text: 'Join game'
                })
            );
        }
    },
    
    handleList: function (games) {
        this.html.gameList.empty();

        if (games.length == 0) {
            this.html.gameList.adopt(new Element('tr').adopt(
                new Element('td', {
                    'class': 'no-games',
                    colspan: 3,
                    text: 'There are currently no open games.'
                })
            ));
        } else {
            for (var i = 0; i < games.length; i++) {
                var g = games[i], row;
                var turn = (g.state == 'playing' && g.current_player == 1);
                this.html.gameList.adopt(new Element('tr', {
                    'class': g.state
                }).adopt(
                    new Element('td', {
                        'class': 'action',
                        rowspan: g.max_players
                    }).adopt(
                        new Element('button', {
                            events: {
                                click: this.goToGame.bind(this, g.id)
                            },
                            text: g.state == 'playing' && g.playing_as > 0 ? 'Play' : 'View'
                        })
                    ),
                    new Element('td', {
                        'class': 'rule-set',
                        rowspan: g.max_players,
                        text: this.ruleSets[g.rule_set_id]
                    }),
                    this.handleList_playerTd(0, g)
                ));
                
                for (var j = 1; j < g.max_players; j++) {
                    this.html.gameList.adopt(new Element('tr', {
                        'class': g.state
                    }).adopt(this.handleList_playerTd(j, g)));
                }
            }
        }
        
        $clear(this.timer);
        this.timer = this.refresh.delay(10000, this);
    },
    
    handleStatus: function (game) {
        if (game !== false) {
            var pa = game.playing_as;
            var cp = game.current_player;

            var status;
            switch (game.state) {
                case 'waiting':
                    status = 'This game needs more players before it can start.';
                    break;
                case 'playing':
                    status = 'This game is currently being played. It\'s ' +
                             (pa == cp ? 'your' : game.players[cp - 1] + '\'s') +
                             ' turn.';
                    break;
                case 'aborted':
                    status = 'This game was aborted.';
                    break;
                case 'draw':
                    status = 'This game ended in a draw.';
                    break;
                case 'win':
                    status = 'This game has ended. ';
                    if (pa == cp)
                        status += 'You won!';
                    else
                        status += game.players[cp - 1] + ' won.';
                    break;
            }

            this.html.game.set('class', 'game player-' + pa);
            this.html.gameStatus.set('text', status);

            var jol = this.html.joinOrLeave;
            jol.set('text', pa ? 'Leave' : 'Join');
            if (game.state == 'waiting') {
                jol.disabled = false;
                jol.onclick = pa ? this.leaveGame.bind(this) : this.joinGame.bind(this, this.gameId);
            } else {
                jol.disabled = true;
            }

            this.html.players.empty();
            for (var i = 0; i < game.players.length; i++) {
                var li = new Element('li', { text: game.players[i] }).inject(this.html.players);
                if (game.state == 'playing' && i + 1 == cp) {
                    li.set('class', 'current');
                }
            }

            var width = game.board.length, height = game.board[0].length;
            if (this.turn === null) {
                this.html.cells = [];
                this.html.gameBoard.empty();

                for (var y = 0; y < height; y++) {
                    var row = new Element('tr').inject(this.html.gameBoard);
                    for (var x = 0; x < width; x++) {
                        if (!this.html.cells[x]) this.html.cells[x] = [];

                        var player = game.board[x][y];
                        this.html.cells[x][y] = new Element('td', {
                            events: {
                                click: this.move.bind(this, [x, y]),
                                mouseenter: function () { this.addClass('hover'); },
                                mouseleave: function () { this.removeClass('hover'); }
                            },
                            'class': player ? 'player-' + player : 'empty'
                        }).inject(row);
                    }
                }
            } else {
                for (var y = 0; y < height; y++) {
                    for (var x = 0; x < width; x++) {
                        var player = game.board[x][y];
                        this.html.cells[x][y].set('class', player ? 'player-' + player : 'empty');
                    }
                }
            }

            this.gameState = game.state;
            this.turn = game.turn;
        }
        
        $clear(this.timer);
        if (this.gameState == 'waiting') {
            this.timer = this.refresh.delay(6000, this);
        } else if (this.gameState == 'playing') {
            this.timer = this.refresh.delay(2000, this);
        }
    },
    
    joinGame: function (gameId) {
        var mc = this;
        mc.service.joinGame(gameId, function (game) {
            mc.goToGame(gameId);
            mc.handleStatus(game);
        });
    },
    
    leaveGame: function () {
        this.service.leaveGame(this.gameId, this.setMode.bind(this, MonkeyClient.Mode.lobby));
    },
    
    move: function (x, y) {
        if (this.mode == MonkeyClient.Mode.game) {
            this.service.move(this.gameId, x, y, this.handleStatus.bind(this));
        }
    },
    
    refresh: function () {
        $clear(this.timer);

        switch (this.mode) {
            case MonkeyClient.Mode.lobby:
                this.service.listGames(this.handleList.bind(this));
                break;
            case MonkeyClient.Mode.game:
                this.service.gameStatus(this.gameId, this.turn, this.handleStatus.bind(this));
                break;
        }
    },
    
    setMode: function (newMode) {
        if (newMode == this.mode) return;
        
        switch (this.mode) {
            case MonkeyClient.Mode.lobby:
                this.html.lobby.dispose();
                this.html.gameList.empty();

                break;
            case MonkeyClient.Mode.game:
                this.html.game.dispose();
                this.html.gameBoard.empty();
                this.html.gameStatus.set('text', '');

                this.gameId = null;
                this.turn = null;

                break;
        }
        
        this.mode = newMode;
        
        switch (this.mode) {
            case MonkeyClient.Mode.lobby:
                this.html.main.set('class', 'monkey in-lobby');
                this.html.lobby.inject(this.html.main);

                break;
            case MonkeyClient.Mode.game:
                this.html.main.set('class', 'monkey in-game');
                this.html.game.inject(this.html.main);

                break;
        }
        
        this.refresh();
    }
});

MonkeyClient.Mode = {
    lobby: 1,
    game: 2
};
