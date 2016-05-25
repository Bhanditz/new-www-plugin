(function ($) {
    "use strict";

    function CCResource(data, options) {
        $.extend(this, this.DEFAULT_OPTIONS, options);
        this.init(data);
    };

    CCResource.prototype.DEFAULT_OPTIONS = {
    };

    CCResource.prototype.DEFAULT_DATA = {
        'url': undefined,
        'title': undefined,
        'type': undefined,
        'typeName': undefined,
        'typeIcon': undefined,
        'imageURL': undefined,
        'imageCaptionHtml': undefined,
        'platformIcon': undefined,
        'platformName': undefined
    };

    CCResource.prototype.init = function(data) {
        this.data = {};
        $.extend(this.data, this.DEFAULT_DATA, data);
    };

    CCResource.prototype.createElem = function(container) {
        var data = this.data,
            resourceElem = $('<div>').addClass('resource'),
            figureElem = $('<figure>').appendTo(resourceElem),
            creditsElem = $('<div>').addClass('credits').appendTo(resourceElem);

        if (data.type) {
            $(resourceElem).addClass('resource-type-'+data.type);
        }

        if (data.typeColor) {
            $(resourceElem).css('background-color', '#'+data.typeColor);
        }

        if (data.typeIcon) {
            var iconElem = $('<img>').attr({
                'class': 'resource-icon',
                'src': data.typeIcon,
                'alt': data.typeName
            });
            iconElem.appendTo(resourceElem);
        }

        if (data.imageURL) {
            $(container).addClass('loading');
            var preloadImage = $('<img>');
            preloadImage.one('load error', function(e) {
                $(container).removeClass('loading');
                if (e.type == 'error') $(container).addClass('loading-error');
                $(this).remove();
            });
            preloadImage.attr('src', data.imageURL);
            figureElem.addClass('cc-resource-image').css({
                'background-image': 'url(\'' + data.imageURL + '\')'
            })
        } else {
            figureElem.addClass('cc-resource-text').append(
                $('<p>').html(data.title)
            );

        }

        if (data.typeName) {
            var typeWrapper = $('<div>').addClass('resource-type').appendTo(creditsElem);
            $('<span>').text(data.typeName).appendTo(typeWrapper);
        }

        if (data.imageCaptionHtml) {
            var captionWrapper = $('<div>').addClass('resource-caption').appendTo(creditsElem);
            $('<div>').html(data.imageCaptionHtml).appendTo(captionWrapper);
        }

        if (data.platformIcon) {
            $('<img>').attr({
                'class': 'resource-logo',
                'src': data.platformIcon,
                'alt': data.platformName
            }).appendTo(creditsElem);
        }

        $(container).empty().append(resourceElem);
        $(container).removeClass('empty');
    };


    function CCResourceFeed(requestURL, options) {
        $.extend(this, this.DEFAULT_OPTIONS, options);
        this.init(requestURL);
    };

    CCResourceFeed.prototype.DEFAULT_OPTIONS = {
        'batchSize': 60,
        /* Always limit the number of resources to load */
        'defaultConnectionLimit': 250,
        'meteredConnectionLimit': 30,
        /* It is typically safe to assume that these connection types are metered */
        'meteredConnectionTypes': ['bluetooth', 'cellular', 'wimax'],
        'onResourcesLoaded': function() {}
    };

    CCResourceFeed.prototype.init = function(requestURL) {
        this.requestURL = requestURL;
        this.resourcesTotal = undefined;
        this.resourcesRemaining = undefined;
        this.incomingData = [];
        this.nextRequestStart = 0;
        this.loading = undefined;
    };

    CCResourceFeed.prototype.next = function() {
        /* TODO: Instead, we should check hasNext and call loadMore
         *       automatically if we aren't at the end */
        var data = this.incomingData.shift(),
            resource = new CCResource(data);
        return resource;
    };

    CCResourceFeed.prototype.hasNext = function() {
        return this.incomingData.length > 0;
    };

    CCResourceFeed.prototype.loadMore = function() {
        var _this = this;
        var isLoading = this.loading ? !this.loading.status : false;
        if (!isLoading) {
            var requestEnd = this.getMaximum() - this.nextRequestStart;
            this.loading = $.ajax({
                'url': this.requestURL,
                'type': 'post',
                'dataType': 'json',
                'data': {
                    action: 'get_resources',
                    start: this.nextRequestStart,
                    count: Math.min(this.batchSize, requestEnd)
                }
            }).done(function(data, textStatus, jqXHR) {
                _this.addResourcesFromData(data);
            });
        }
    };

    CCResourceFeed.prototype.getMaximum = function() {
        var maximum = this.getConnectionLimit();

        if (this.resourcesTotal !== undefined && maximum !== undefined) {
            maximum = Math.min(maximum, this.resourcesTotal);
        } else {
            maximum = this.resourcesTotal;
        }

        return maximum;
    };

    CCResourceFeed.prototype.getConnectionLimit = function() {
        var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection,
            connectionType = (connection) ? connection.type : undefined,
            isMetered = this.meteredConnectionTypes.indexOf(connectionType) >= 0;

        return (isMetered) ? this.meteredConnectionLimit : this.defaultConnectionLimit;
    };

    CCResourceFeed.prototype.addResourcesFromData = function(data) {
        data = data || {};

        this.resourcesTotal = data['total'];
        this.resourcesRemaining = data['remaining'];

        var newResources = data['resources'] || [];

        if (newResources) {
            Array.prototype.push.apply(this.incomingData, newResources);
            this.nextRequestStart += newResources.length;
            this.onResourcesLoaded();
        }
    };


    function CCResourceGrid(container, options) {
        $.extend(this, this.DEFAULT_OPTIONS, options);
        this.init(container);
    };

    CCResourceGrid.prototype.DEFAULT_OPTIONS = {
        'maximum': undefined
    };

    CCResourceGrid.prototype.DEFAULT_ADD_TILES_OPTIONS = {
        'initial': false
    };

    CCResourceGrid.prototype.init = function(container) {
        this.container = $(container);
        this.tileWidth = undefined;
        this.tileHeight = undefined;
        this.rowSize = undefined;
        // List of resource tiles with class "empty", duplicated here to avoid
        // hammering the browser with DOM lookups
        this.emptyTiles = [];
        this.tilesCount = 0;
    };

    CCResourceGrid.prototype.updateDimensions = function() {
        // Cache element dimensions that only change on resize
        var aTile = this.container.children('.resource-tile').first();
        if (aTile.length > 0) {
            var listWidth = this.container.outerWidth();
            this.tileWidth = Math.ceil(aTile.outerWidth()),
            this.tileHeight = Math.ceil(aTile.outerHeight());
        } else {
            this.tileWidth = 0;
            this.tileHeight = 0;
        }
        this.rowSize = this.tileWidth > 0 ? Math.ceil(listWidth / this.tileWidth) : undefined;
    };

    CCResourceGrid.prototype.setInitialDimensions = function(addTilesOptions) {
        this.addTiles(1, addTilesOptions);
        this.updateDimensions();
    };

    CCResourceGrid.prototype.updateOnScreen = function() {
        // Loops through resource tiles and marks them if they are offscreen.
        // This may be a good place to proactively unload images if we need to.

        var scrollTop = $(window).scrollTop(),
            scrollBottom = scrollTop + $(window).height();

        var footerElem = $('.site-footer.sticky');
        if (footerElem.hasClass('detached') && !footerElem.hasClass('offscreen')) {
            scrollBottom -= footerElem.height();
        }

        $('.resource-tile', this.container).each(function(index, resourceTile) {
            var tileTop = $(resourceTile).offset().top,
                tileBottom = tileTop + $(resourceTile).height();
            if (scrollTop < tileBottom && scrollBottom > tileTop) {
                // It is tempting to remove offscreen resources from the DOM,
                // but modern browsers do the important bits automatically.
                $(resourceTile).removeClass('offscreen offscreen-above offscreen-below never-shown').addClass('onscreen')
            } else if (scrollTop > tileBottom) {
                $(resourceTile).removeClass('onscreen offscreen-below').addClass('offscreen offscreen-above');
            } else {
                $(resourceTile).removeClass('onscreen offscreen-above').addClass('offscreen offscreen-below');
            }
        });
    };

    CCResourceGrid.prototype.getRemaining = function() {
        if (this.maximum !== undefined) {
            return this.maximum - this.tilesCount;
        } else {
            return undefined;
        }
    };

    CCResourceGrid.prototype.addTiles = function(count, addTilesOptions) {
        var remainingTiles = this.getRemaining(),
            options = $.extend({}, this.DEFAULT_ADD_TILES_OPTIONS, addTilesOptions);

        if (remainingTiles !== undefined) {
            count = Math.min(count, remainingTiles);
        }

        for (var i = 0; i < count; i++) {
            var resourceTile = $('<div>').addClass('resource-tile empty');
            if (!options.initial) resourceTile.addClass('never-shown');
            this.emptyTiles.push(resourceTile);
            resourceTile.appendTo(this.container);
        }

        this.tilesCount += count;
        return count;
    };

    CCResourceGrid.prototype.addRows = function(rows, addTilesOptions) {
        if (this.rowSize === undefined) this.setInitialDimensions(addTilesOptions);

        // Add enough resource tiles to fill the given number of rows.
        // We calculate a remainder to keep everything square.
        var tilesNeeded = rows * this.rowSize,
            remainder = (this.tilesCount + tilesNeeded) % this.rowSize;
        return this.addTiles(tilesNeeded + remainder, addTilesOptions);
    };

    CCResourceGrid.prototype.addRowsForSpace = function(scrollBottom, addTilesOptions) {
        if (this.tileHeight === undefined) this.setInitialDimensions(addTilesOptions);

        var listBottom = this.container.offset().top + this.container.outerHeight(),
            triggerEdge = listBottom - this.tileHeight,
            distanceFromEdge = scrollBottom - triggerEdge,
            rowsNeeded = this.tileHeight > 0 ? Math.ceil(distanceFromEdge / this.tileHeight) : 0;

        if (rowsNeeded > 0) {
            // Load as many rows as we need, and a bit extra
            return this.addRows(rowsNeeded + 1, addTilesOptions);
        } else {
            return 0;
        }
    };

    CCResourceGrid.prototype.next = function() {
        var resourceTile = this.emptyTiles.shift();
        return resourceTile;
    };

    CCResourceGrid.prototype.fillTiles = function(resources) {
        // Loop through empty resource tiles and add loaded resources to them.
        while (this.hasNext() && resources.hasNext()) {
            var resourceTile = this.next(),
                resource = resources.next();
            resourceTile.data('resource', resource);
            resource.createElem(resourceTile);
        }

        // Return true if all tiles were filled; false if we ran out of resources.
        return resources.hasNext() || !this.hasNext();
    }

    CCResourceGrid.prototype.hasNext = function() {
        return this.emptyTiles.length > 0;
    };


    $(document).ready(function() {
        var resourceFeed = undefined,
            resourceGrid = undefined;

        var fillEmptyResourceTiles = function() {
            var needsMoreResources = !resourceGrid.fillTiles(resourceFeed);
            if (needsMoreResources) {
                resourceFeed.loadMore();
            }
        };

        var onResourcesLoaded = function() {
            resourceGrid.maximum = resourceFeed.getMaximum();
            fillEmptyResourceTiles();
        };

        var onResizeCb = function(e) {
            resourceGrid.updateDimensions();
            resourceGrid.updateOnScreen();
        };

        var onScrollCb = function(e, params) {
            resourceGrid.updateOnScreen();
        };

        var onScrollDownCb = function(e, params) {
            var newTilesCount = resourceGrid.addRowsForSpace(params['bottom']);
            if (newTilesCount > 0) {
                fillEmptyResourceTiles();
            }
        };

        resourceGrid = new CCResourceGrid('.resource-list');
        resourceGrid.addRows(2, {
            'initial': true
        });

        resourceFeed = new CCResourceFeed(CC_RESOURCE.ajaxurl, {
            'onResourcesLoaded': onResourcesLoaded
        });
        resourceFeed.addResourcesFromData(CC_RESOURCE.initial);

        $(window).on('resize', onResizeCb);
        $(document).on('cc-scroll', onScrollCb);
        $(document).on('cc-scroll-down', onScrollDownCb);
    });
})(jQuery);