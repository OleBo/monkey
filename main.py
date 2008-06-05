# -*- coding: cp1252 -*-
#
# Copyright (c) 2008 Andreas Blixt <andreas@blixt.org>
# Project homepage: <http://code.google.com/p/monkey-web/>
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

"""Google App Engine entry point for the MoNKey! game.

Registers the WSGI web application with request handlers, also defined
in this file.
"""

from google.appengine.ext import webapp

import wsgiref.handlers
import monkey, re, util

class GameService(util.ServiceHandler):
    """Methods that can be called through HTTP (intended to be called by
    JavaScript through an XmlHttpRequest object.
    """
    def create(self, rule_set_id):
        """Creates a new game.
        """
        rule_set = monkey.RuleSet.get_by_id(rule_set_id)
        if not rule_set: raise ValueError('Invalid rule set id.')

        player = monkey.Player.get_current()
        game = monkey.Game(rule_set = rule_set)
        game.put()

        player.join(game)

        return game.key().id()
    
    def join(self, game_id):
        """Joins an existing game.
        """
        game = monkey.Game.get_by_id(game_id)
        if not game: raise ValueError('Invalid game id.')

        player = monkey.Player.get_current()
        player.join(game)

        return self.status(game_id)

    def list(self, states = ['waiting', 'playing', 'aborted', 'draw', 'win']):
        games = []
        for game in monkey.Game.gql('WHERE state IN :1 '
                                    'ORDER BY last_update DESC '
                                    'LIMIT 10', states):
            player = monkey.Player.get_current()
            rules = game.rule_set

            games.append({
                'id': game.key().id(),
                'players': [monkey.Player.get(p).user.nickname()
                            for p in game.players],
                 'rule_set': { 'id': rules.key().id(),
                               'name': rules.name,
                               'num_players': rules.num_players },
                'playable': game.state == 'playing' and
                            player.key() in game.players,
                'state': game.state,
                'last_update': str(game.last_update) })

        return games
        
    def move(self, game_id, x, y):
        game = monkey.Game.get_by_id(game_id)
        if not game: raise ValueError('Invalid game id.')

        player = monkey.Player.get_current()
        game.move(player, x, y)

        return self.status(game_id)

    def new_rule_set(self, name, m, n, k, p = 1, q = 1, num_players = 2):
        if not re.match('^[\\w]([\\w&\'\\- ]{0,28}[\\w\'!])$', name):
            raise ValueError('Invalid name.')

        rule_set = monkey.RuleSet(name = name,
                                  author = monkey.Player.get_current(),
                                  num_players = num_players,
                                  m = m, n = n, k = k,
                                  p = p, q = q)
        rule_set.put()

        return rule_set.key().id()

    def rule_sets(self):
        rule_sets = []
        for rule_set in monkey.RuleSet.all():
            rule_sets.append({ 'id': rule_set.key().id(),
                               'name': rule_set.name,
                               'num_games': rule_set.games.count(),
                               'num_players': rule_set.num_players,
                               'm': rule_set.m, 'n': rule_set.n,
                               'k': rule_set.k, 'p': rule_set.p,
                               'q': rule_set.q })
        return rule_sets

    def status(self, game_id, turn = None):
        """Gets the status of game.
        """
        game = monkey.Game.get_by_id(game_id)
        if not game: raise ValueError('Invalid game id.')

        if turn != None and game.turn == turn: return False

        pkey = monkey.Player.get_current().key()
        if pkey in game.players:
            playing_as = game.players.index(pkey) + 1
        else:
            playing_as = 0
        
        return {
            'players': [monkey.Player.get(p).user.nickname()
                        for p in game.players],
            'board': game.unpack_board(),
            'playing_as': playing_as,
            'current_player': game.rule_set.whose_turn(
                game.turn if game.state == 'playing' else game.turn - 1),
            'state': game.state,
            'turn': game.turn }

class HomePage(util.ExtendedHandler):
    def get(self):
        self.template('home.html')

def main():
    application = webapp.WSGIApplication([
        ('/', HomePage),
        ('/game/.*', GameService)
    ])
    wsgiref.handlers.CGIHandler().run(application)

if __name__ == '__main__':
    main()
