/**
 * Netflix Details Link
 * Copyright (c) 2012 Chris Nanney
 * https://github.com/cnanney/Netflix-Enhancements
 *
 * Licensed under MIT
 * http://www.opensource.org/licenses/mit-license.php
 */

(function(){

  var NEContent = {
    log: [],

    detailLinks: function(){
      var linkRegex = /^https?:\/\/(?:movies|www)?\.?netflix\.com\/WiPlayer\?movieid=(\d+)/;

      $('span.hoverPlay:not(.ndl-processed)').each(function(){

        var link = $(this).find('a.playLink').attr('href');

        if (link && linkRegex.test(link)){
          var detailsUrl = 'http://www.netflix.com/WiMovie/'+link.match(linkRegex)[1];
          var badge = document.createElement('a');
          badge.className = 'episodeBadge';
          badge.href = detailsUrl;
          badge.innerHTML = 'Details';
          this.appendChild(badge);
        }
        $(this).addClass('ndl-processed');
      });

      $('div.lockup:not(.ndl-processed)').each(function(){

        var link = $(this).find('a.playHover').attr('href');

        if (link && linkRegex.test(link)){
          var detailsUrl = 'http://www.netflix.com/WiMovie/'+link.match(linkRegex)[1];
          var badge = document.createElement('a');
          badge.className = 'episodeBadge';
          badge.href = detailsUrl;
          badge.innerHTML = 'Details';
          this.appendChild(badge);
        }
        $(this).addClass('ndl-processed');
      });
    },

    observePopupMutations: function(){

      var old_target = document.querySelector('#BobMovie');
      var new_target = document.querySelector('#bob-container');

      var throttled = _.throttle(NEContent.searchRT, 500, {trailing: false});

      var old_config = {
        attributes: true,
        attributeFilter: ['class']
      };
      var config = {
        attributes: true, subtree: true,
        attributeFilter: ['class']
      };
      var $div;

      var old_observer = new WebKitMutationObserver(function(mutations){
        mutations.forEach(function(mutation){

          $div = $(mutation.target);
          if ($div.is(':visible')){
            // For popovers near the bottom of screen, the extra line of text for RT expands it off the page
            // slightly, so lets move it up a bit.

            var duration = $div.find('span.duration').text();

            if (duration.indexOf('minutes') != -1){

              var title = $.trim($div.find('span.title').text());
              var year = $.trim($div.find('span.year').text());

              throttled(title, year, $div);

            }
          }

        });
      });

      var new_observer = new WebKitMutationObserver(function(mutations){
        var muts = [];
        mutations.forEach(function(mutation){
          muts.push(mutation);
        });

        if (muts.length > 0){
          //console.log(muts);
          $div = $('#bob-container');
          if ($div.css('opacity') == '1'){

            var duration = $div.find('span.runtime').text();

            if (duration.indexOf('minutes') != -1){

              var title = $.trim($div.find('span.title').text());
              var year = $.trim($div.find('span.year').text());
              //console.log('throttle called', Date.now());
              throttled(title, year, $div);
            }
          }

        }


      });

      if (old_target) old_observer.observe(old_target, old_config);
      else new_observer.observe(new_target, config);
    },


    // Was going to use this instead of listening for web requests, but when new
    // titles are added with infinite scroll, the mutation event fires anywhere
    // between 1-5 times, each with addedNodes, so is rather inefficient.
    // Listening for web requests is the better way IMO, as it only fires once,
    // and doesn't add any new permissions to extension installation.
    observeScrollMutations: function(){
      var target = document.querySelector('.agMovieSet');
      var config = {
        childList: true
      };
      var observer = new WebKitMutationObserver(function(mutations){
        mutations.forEach(function(mutation){
          if (mutation.addedNodes.length > 0){
            NEContent.detailLinks();
          }
        });
      });

      observer.observe(target, config);
    },

    searchRT: function(t, y, d){

      this.log = [];

      var apiKey = 'ff4cu2k9h23mtght5jpgpn5v';
      var searchTitle = t.replace(/\s?\(.*\)/g, '');
      var $div = d;
      var startRTSearch = new Date();

      this.log.push('Netflix Movie Title: '+t);
      this.log.push('RT Search String: '+searchTitle);

      var url = 'http://api.rottentomatoes.com/api/public/v1.0/movies.json?page_limit=50&apikey='+
        apiKey+'&q='+encodeURI(searchTitle);

      $.getJSON(url, function(data){

        var endRTSearch = new Date();
        NEContent.log.push('RT Search Elapsed Time: '+(endRTSearch-startRTSearch)+'ms');

        if (data){

          NEContent.log.push({'RT API Data': data});

          if (data.movies.length == 1){
            processRT(data.movies[0]);
          }

          else{
            var possibles = [];
            // more that one result, lets match up by title matches first
            $.each(data.movies, function(key, movie){
              if (cleanTitle(movie.title) == cleanTitle(t)){
                possibles.push(movie);
              }
            });

            if (possibles.length > 0){
              if (possibles.length == 1){
                // sweet, we'll assume it's the right one
                processRT(possibles[0]);
              }
              else{
                var match = false;
                // ok, more than one possibility - lets compare year
                $.each(possibles, function(key, movie){
                  // Can't just compare movie.year == y, because years on both sides can be wrong.
                  // On Netflix a movie could be year 2008, and RT's release date could also be 2008,
                  // but still return 2007 for movie.year, WTF?
                  // So we check release and dvd date instead.
                  // Even then some matches will be off because one will be wrong. Oh well.
                  if ((movie.release_dates.hasOwnProperty('theater') && movie.release_dates.theater.slice(0, 4) == y) ||
                    (movie.release_dates.hasOwnProperty('dvd') && movie.release_dates.dvd.slice(0, 4) == y)){
                    // This has got to be it
                    match = true;
                    processRT(movie);
                  }
                });
                if (!match){
                  NEContent.log.push('No RT matches out of '+possibles.length+' possibles');
                  NEContent.writeLog();
                }
              }
            }
            else{
              NEContent.log.push('No RT matches');
              NEContent.writeLog();
            }
          }
        }
        else{
          NEContent.log.push('No API results');
          NEContent.writeLog();
        }
      });


      // Helper functions
      var processRT = function(m){

        if (m.hasOwnProperty('ratings')){
          // Critic's rating may or may not be there
          var rating = m.ratings.hasOwnProperty('critics_rating') ? m.ratings.critics_rating : false;
          // Critics score will be -1 if nothing
          var score = m.ratings.critics_score != -1 ? m.ratings.critics_score : false;
          var url = m.links.hasOwnProperty('alternate') ? m.links.alternate : '#';

          if (rating !== false && score !== false){
            $div.css('top', '-=45px');
            var html = '<a class="ne-rating ne-'+rating.toLowerCase().replace(/\s/g, '-')+'" '+
              'href="'+url+'" target="_blank"><span>'+rating+': '+score+'%</span></a>';
            $div.find('a.ne-rating').remove();
            $div.find('div.info').append(html);
            $div.find('div.bob-info').append(html);
            NEContent.log.push('RT Rating: '+rating);
          }
          else{
            NEContent.log.push('No RT rating.');
          }
        }
        else{
          NEContent.log.push('No RT rating.');
        }
        NEContent.writeLog();
      };

      var cleanTitle = function(t){
        // There is no catch-all way that will always match name discrepancies between RT and Netflix,
        // but this does an OK job sterilizing the titles without producing needless looping and year checks.
        return $.trim(t
            // There usually is a discrepancy with roman numerals
            // http://stackoverflow.com/questions/267399
            //.replace(/(M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3}))(?=\W|$)/g, '')
            // Remove anything in parenthesis
            .replace(/\(.*\)/g, '')
            // Remove anything after colon
            .replace(/:.*$/g, '')
            // And finally, remove anything not a-z
            .replace(/[^a-z]/gi, '')
            .toLowerCase()
        );
      };

    },

    init: function(){

      chrome.extension.sendMessage({req: 'storage'}, function(response){
        var storage = response.storage;
        if (storage['ne-opt-details'] == '1') NEContent.detailLinks();
        if (storage['ne-opt-rt'] == '1') NEContent.observePopupMutations();
      });

      chrome.extension.onMessage.addListener(
        function(request, sender, sendResponse){
          if (request.greeting == "webRequest"){
            NEContent.detailLinks();
          }
        }
      );
    },

    writeLog: function(){
      chrome.extension.sendMessage({req: 'log', data: NEContent.log}, function(response){
      });
    }

  };

  NEContent.init();

})();