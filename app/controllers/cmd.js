// import modules
var      _ = require('lodash'),
      util = require('util'),
    moment = require('moment'),
         c = require('irc-colors'),
      Game = require('./game'),
    Player = require('../models/player');

var Cmd = function Cmd(bot) {
    var   self = this,
        client = bot.client,
        config = bot.config,
       channel = bot.channel,
             p = config.commandPrefixChars[0];

    /**
     * Test if no game is running
     * @param silent - don't warn in the channel
     */
    self.noGame = function(silent) {
        if (!bot.game) {
            if (!silent) self.sayNoGame();
            return true;
        }
        return false;
    };

    /**
     * Get the command data associated with 'alias'
     * @param alias
     */
    self.findCommand = function(alias) {
        return _.find(bot.commands, function(cmd) { return (_.contains(cmd.commands, alias)); });
    };

    /**
     * Say something in the game channel
     */
    self.say = function(message) {
        client.say(channel, message);
    };

    /**
     * Say there's no game running
     */
    self.sayNoGame = function () {
        self.say(util.format('No game running. Start the game by typing %sstart.', p));
    };

    /**
     * Start a game
     * @param message
     * @param cmdArgs
     */
    self.start = function (message, cmdArgs) {
        var loadDecks = [],
            failDecks = [],
               rounds = config.pointLimit;

        if (bot.game) {
            if (bot.game.getPlayer({nick: message.nick}))
                self.say('You are already in the current game.');
            else
                self.say(util.format('A game is already running. Type %sjoin to join the game.', p));
            return false;
        }

        // point limit
        if (cmdArgs[0] && !isNaN(cmdArgs[0])) {
            rounds = parseInt(cmdArgs[0]);
            cmdArgs = _.rest(cmdArgs);
        }
        _.each(cmdArgs, function(arg) {
            if (arg.match(/^\w{5}$/)) {
                arg = arg.toUpperCase();
                if (_.contains(config.decks, arg))
                    loadDecks.push(arg);
                else
                    failDecks.push(arg);
            }
        }, this);
        if (failDecks.length)
            self.say(util.format('Could not load decks: %s; see %sdecks', failDecks.join(', '), p));

        bot.game = new Game(bot, rounds, loadDecks);
        self.join(message, cmdArgs);
    };

    /**
     * Stop a game
     * @param message
     * @param cmdArgs
     */
    self.stop = function (message, cmdArgs) {
        if (self.noGame()) return;
        bot.game.stop(bot.game.getPlayer({user: message.user, hostname: message.hostname}));
        bot.game = undefined;
    };

    /**
     * Pause a game
     * @param message
     * @param cmdArgs
     */
     self.pause = function(message, cmdArgs) {
        if (self.noGame()) return;
        bot.game.pause();
     };

    /**
     * Resume a game
     * @param message
     * @param cmdArgs
     */
     self.resume = function(message, cmdArgs) {
        if (self.noGame()) return;
        bot.game.resume();
     };

    /**
     * Add player to game
     * @param message
     * @param cmdArgs
     */
    self.join = function (message, cmdArgs) {
        var     nick = message.nick,
                user = message.user,
            hostname = message.host;

        if (self.noGame(config.startOnFirstJoin)) {
            if (config.startOnFirstJoin)
                self.start(message, cmdArgs);
            return;
        }
        var player = new Player(nick, user, hostname);
        bot.game.addPlayer(player);
    };

    /**
     * Remove player from game
     * @param message
     * @param cmdArgs
     */
    self.quit = function (message, cmdArgs) {
        if (self.noGame()) return;
        bot.game.removePlayer(bot.game.getPlayer({user: message.user, hostname: message.hostname}));
    };

    /**
     * Remove a player
     * @param message
     * @param cmdArgs
     */
    self.remove = function (message, cmdArgs) {
        var target = cmdArgs[0];
        if (self.noGame()) return;

        var player = bot.game.getPlayer({nick: target});
        if (typeof(player) === 'undefined')
            self.say(target + ' is not currently playing.');
        else {
            bot.game.removed.push(bot.game.getPlayerUhost(player));
            bot.game.removePlayer(player);
        }
    };

    /**
     * Get players cards
     * @param message
     * @param cmdArgs
     */
    self.cards = function (message, cmdArgs) {
        if (self.noGame()) return;
        var player = bot.game.getPlayer({user: message.user, hostname: message.hostname});
        bot.game.showCards(player);
    };

    /**
     * Play cards
     * @param message
     * @param cmdArgs
     */
    self.play = function (message, cmdArgs) {
        if (self.noGame()) return;
        var player = bot.game.getPlayer({user: message.user, hostname: message.hostname});
        if (player)
            bot.game.playCard(cmdArgs, player);
    };

    /**
     * List players in the game
     * @param message
     * @param cmdArgs
     */
    self.list = function (message, cmdArgs) {
        if (self.noGame()) return;
        bot.game.listPlayers();
    };

    /**
     * Select the winner
     * @param message
     * @param cmdArgs
     */
    self.winner = function (message, cmdArgs) {
        if (self.noGame()) return;
        var player = bot.game.getPlayer({user: message.user, hostname: message.hostname});
        if (player)
            bot.game.selectWinner(cmdArgs[0], player);
    };

    /**
     * Show top players in current game
     * @param message
     * @param cmdArgs
     */
    self.points = function (message, cmdArgs) {
        if (self.noGame()) return;
        bot.game.showPoints();
    };

    /**
     * Show top players in current game
     * @param message
     * @param cmdArgs
     */
    self.status = function(message, cmdArgs) {
        if (self.noGame()) return;
        bot.game.showStatus();
    };

    /**
     * Alias command for winner and play
     * @param message
     * @param cmdArgs
     */
    self.pick = function (message, cmdArgs)
    {
        // check if everyone has played and end the round
        var user = message.user,
            hostname = message.host,
            fastPick = false;
        if (config.enableFastPick) {
            fastPick = cmdArgs[1];
            if (fastPick === true)
                cmdArgs = cmdArgs[0];
        }
        if (self.noGame(fastPick)) return;
        var player = bot.game.getPlayer({user: user, hostname: hostname});

        if (!player)
            return false;

        if (bot.game.state === Game.STATES.PLAYED)
            bot.game.selectWinner(cmdArgs[0], player, fastPick);
        else if (bot.game.state === Game.STATES.PLAYABLE)
            bot.game.playCard(cmdArgs, player, fastPick);
        else
            fastPick || self.say(util.format('%spick command not available in current state.', p));
    };

    /**
     * Show game help
     * @param message
     * @param cmdArgs
     */
    self.help = function(message, cmdArgs) {
        var help;
        if (cmdArgs[0] === undefined) {
            // list commands and aliases
            var commands = _.map(config.commands, function(cmd) {
                                var result = p + cmd.commands[0];
                                if (cmd.commands.length > 1) {
                                    var aliases =  _.chain(cmd.commands)
                                                    .rest()
                                                    .map(function(a) { return p + a; })
                                                    .join(', ');
                                    result += util.format(' (%s)', aliases);
                                }
                                return result;
                            });
            help = 'Commands: ' + commands.join('; ') + util.format(' [%shelp <command> for details]', p);
        } else {
            // single command details
            var alias = cmdArgs[0].toLowerCase();
            var cmd = self.findCommand(alias);
            if (!cmd) {
                self.say(util.format('No command "%s%s"', p, cmd));
                return;
            }
            help = p + cmd.commands[0];
            _.each(cmd.params, function(param) {
                var paramHelp = param.name;
                if (param.type === 'number')
                    paramHelp += 'Number';
                if (param.multiple)
                    paramHelp += ', ...';
                paramHelp = (param.required) ? util.format('<%s>', paramHelp)
                                             : util.format('[%s]', paramHelp);
                help += ' ' + paramHelp;
            });
            help += ' - ';
            if (cmd.flag && cmd.flag === 'o')
                help += '(op) ';
            help += cmd.info;
            if (cmd.commands.length > 1)
                help += util.format(' (aliases: %s)', _.chain(cmd.commands)
                                                        .rest()
                                                        .map(function(a) { return p + a; })
                                                        .join(', '));
        }
        self.say(help);
    };

    /**
     * Send someone a NOTICE to help them test their client
     * @param message
     * @param cmdArgs
     */
    self.test = function(message, cmdArgs) {
        client.notice(message.nick, 'Can you hear me now?');
    };

    /**
     * Send beer
     * @param message
     * @param cmdArgs
     */
    self.beer = function (message, cmdArgs)
    {
        var nicks     = [ message.nick ],
            beerNicks = [], beer = [], action = '', beerToBot = false,
            maxNicks  = _.min([config.beers.length, 7]);
        message = '';
        var actions = [
            'pours a tall, cold glass of <%= beer %> and slides it down the bar to <%= nick %>.',
            'cracks open a bottle of <%= beer %> for <%= nick %>.',
            'pours a refreshing pint of <%= beer %> for <%= nick %>',
            'slams a foamy stein of <%= beer %> down on the table for <%= nick %>'
        ];
        var plurals = {
            'tall, cold glasses': 'a tall, cold glass',
            'bottles':            'a bottle',
            'refreshing pints':   'a refreshing pint',
            'foamy steins':       'a foamy stein',
            'them':               'it'
        };
        var listToString = function(list) {
            var last = list.pop();
            return (list.length) ? list.join(', ') + ' and ' + last : last;
        };

        if (cmdArgs[0] == 'all' && bot.game)
            nicks = bot.game.getPlayerNicks();
        else if (cmdArgs.length)
            nicks = cmdArgs;

        if (_.isEqual(nicks, [ client.nick ])) {
            message = _.template('pours itself a tall, cold glass of <%= beer %>. cheers, <%= from %>!');
            client.action(channel, message({
                beer: _.sample(config.beers, 1)[0],
                from: message.nick,
                nick: client.nick
            }));
            return true;            
        }
        _.chain(nicks).uniq().each(function (nick) {
            if (client.nick == nick)
                beerToBot = true;
            else if (client.nickIsInChannel(nick, channel))
                beerNicks.push(nick);
        });
        if (beerNicks.length > maxNicks) {
            self.say("There's not enough beer!");
            return false;
        }
        if (beerNicks.length) {
            action = _.sample(actions, 1)[0];
            if (beerNicks.length > 1) {
                _.each(plurals, function(from, to) { // value, key
                    action = action.split(from).join(to);
                });
            }
            message = _.template(action);
            client.action(channel, message({
                beer: listToString(_.sample(config.beers, beerNicks.length)),
                nick: listToString(beerNicks)
            }));
        }
        if (beerToBot) // pour for self last
            self.beer(message, [ client.nick ]);
    };

    /**
     * List the card decks available
     * @param message
     * @param cmdArgs
     */
    self.decks = function(message, cmdArgs) {
        var reply  = util.format('Card decks available (use %sdeckinfo for details): %s', p, config.decks.join(', '));
            reply += util.format('; default decks: %s', config.defaultDecks.join(', '));
        self.say(reply);
    };

    /**
     * Get information about a deck
     * @param message
     * @param cmdArgs
     */
    self.deckinfo = function(message, cmdArgs) {
        var data, deckCode = cmdArgs[0];

        if (!deckCode || !deckCode.match(/^\w{5}$/)) {
            self.say('Invalid deck code format: ' + cmdArgs[0]);
            return false;
        }
        else {
            deckCode = deckCode.toUpperCase();
            if (!_.contains(config.decks, deckCode)) {
                self.say('Deck ' + deckCode + ' is not enabled. If you really want it, yell about it.');
                return false;
            }
        }

        bot.controller.decks.fetchDeck(deckCode).then(function(data) {
            data.q = data.calls.length;
            data.a = data.responses.length;
            data = _.pick(data, 'name', 'description', 'created', 'author', 'q', 'a');
            data.url = 'https://www.cardcastgame.com/browse/deck/' + deckCode;
            if (typeof data.created === 'object')
                data.created = moment(data.created).format('YYYY-MM-DD');
            else if (typeof data.created == 'string')
                data.created = data.created.match(/^(\d{4}-\d{2}-\d{2})/)[1];
            var reply = util.format('%s: "%s" [%s/%s] by %s on %s (%s) - %s',
                            deckCode,    data.name, 
                            c.bold(data.q),
                                   data.a, 
                            data.author, data.created, 
                            data.url,    data.description.split('\n')[0]
                        ).substring(0, 400);
            self.say(reply);
            return true;
        }, function(error) {
            if (error.name === 'NotFoundError')
                error.message = error.message.split('/').reverse()[0];
            util.log(error.name + ': ' + error.message);
            self.say('Error ' + error.name + ': ' + error.message);
            return false;
        });
    };

};

exports = module.exports = Cmd;
