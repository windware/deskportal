
	$self.item = new function()
	{
		var _class = $id + '.item';

		this.add = function(element) //Add a new bookmark
		{
			var log = $system.log.init(_class + '.add');
			var address = $system.is.address(element.value) ? element.value : 'http://' + element.value; //Prepend the protocol if missing

			var update = function(request)
			{
				if($system.dom.status(request.xml) == '0') log.user($global.log.notice, 'user/add');
				element.value = ''; //Clear the input field

				var still = false; //If any group is chosen or not
				var items = $system.node.id($id + '_selection').elements; //Category selection form

				for(var i = 0; i < items.length; i++) if(items[i].checked) still = true;
				if(!still) $self.item.get(); //Update the listing only no group is selected
			}

			$system.network.send($self.info.root + 'server/php/front.php', {task : 'item.add'}, {address : address}, update);
			return false; //Avoid the form from getting submitted
		}

		this.get = function(callback) //List the bookmarks
		{
			var log = $system.log.init(_class + '.get');

			var form = $system.node.id($id + '_settings'); //Search and sort form
			var param = {task : 'item.get', cat : []}; //Create the parameters to be passed

			//Pick the order selection
			for(var i = 0; i < form.order.length; i++) if(form.order[i].checked) param.order = form.order[i].value;

			var picked = []; //List of categories selected
			var items = $system.node.id($id + '_selection').elements; //Category selection form

			for(var i = 0; i < items.length; i++) //Add the chosen categories
				if(items[i].type == 'checkbox' && items[i].checked) param.cat.push(items[i].value);

			var fetch = function(request) //TODO - Do the ordering on the client side
			{
				log.user($global.log.info, 'user/load');
				var xml = request.xml;

				var zone = $system.node.id($id + '_entries'); //Entry HTML area
				zone.innerHTML = ''; //Clean out the current list

				var container = document.createElement('div');
				container.id = $id + '_container';

				var list = $system.dom.tags(xml, 'bookmark'); //List of bookmarks returned
				var search = form.search.value.length ? $system.text.regexp(form.search.value) : null; //Search term

				var section = $system.array.list('viewed added status cache'); //Bookmark property partial list

				for(var i = 0; i < list.length; i++)
				{
					var address = $system.dom.attribute(list[i], 'address');
					if(!$system.is.address(address)) continue; //Forget entries with no valid address

					//Get its ID and name
					var name = $system.dom.attribute(list[i], 'name') || $system.dom.attribute(list[i], 'title') || address;

					//Crop entries those don't match
					if(search && !name.match(search, 'i') && !address.replace(/^.+?:\/\//, '').match(search, 'i')) continue;

					var id = $system.dom.attribute(list[i], 'id');
					__bookmarks[id] = {address : address, name : name};

					for(var j = 0; j < section.length; j++) __bookmarks[id][section[j]] = $system.dom.attribute(list[i], section[j]);
					__bookmarks[id].category = []; //List of categories associated with the bookmark

					var cat = $system.dom.attribute(list[i], 'category').split(','); //Get the categories
					var belong = []; //List of category names

					for(var j = 0; j < __group.ordered.length; j++) //In the order of presented category order
					{
						for(var k = 0; k < cat.length; k++) //Find the name of the category name
						{
							if(__group.ordered[j].id != cat[k]) continue;

							__bookmarks[id].category[cat[k]] = true;
							belong.push(__group.ordered[j].name);

							break;
						}
					}

					var row = document.createElement('div'); //The link row

					var link = document.createElement('a'); //Create the link
					link.onclick = $system.app.method($self.gui.open, [address]); //Set to open the page on click

					var replace = function(phrase, match)
					{
						if(match != 'added') return $system.text.escape(__bookmarks[id][match]);
						return $system.date.create(__bookmarks[id][match]).format($global.user.pref.format.date);
					}

					$system.tip.set(link, $id, 'info', [$self.info.template.info.replace(/%value:(.+?)%/g, replace)]); //Give info tooltip

					//Create the link content
					link.innerHTML = $system.text.format($self.info.template.line, {item : id, name : $system.text.escape(name)});

					row.appendChild(link);
					container.appendChild(row); //Append to the area
				}

				zone.appendChild(container);
				$system.node.fade(container.id, false);

				if(typeof callback == 'function') callback();
			}

			return $system.network.send($self.info.root + 'server/php/front.php', param, null, fetch); //Request the list of bookmarks
		}

		this.remove = function(id) //Remove a bookmark
		{
			var log = $system.log.init(_class + '.remove');
			if(!$system.is.digit(id)) return log.param();

			var language = $system.language.strings($id);
			if(!confirm(language.confirm)) return false;

			$system.window.fade($id + '_edit_' + id, true, null, true); //Let go of the edit window
			delete __opened[id]; //Remove from list of opened windows

			var update = function()
			{
				log.user($global.log.notice, 'user/remove', '', [__bookmarks[id] ? __bookmarks[id].name : id]);
				$self.item.get();
			}

			//Remove the bookmark entry
			return $system.network.send($self.info.root + 'server/php/front.php', {task : 'item.remove'}, {id : id}, update);
		}

		this.set = function(id, form) //Update bookmark information
		{
			var log = $system.log.init(_class + '.set');
			if(!$system.is.digit(id) || !$system.is.element(form, 'form')) return log.param();

			var param = {id : id, address : form.address.value, cat : [], name : form.name.value}; //Form value to send
			var list = $system.node.id($id + '_edit_categories_' + id).elements; //Category check boxes

			for(var i = 0; i < list.length; i++) if(list[i].checked) param.cat.push(list[i].value); //Pick the checked values

			var get = []; //Current category choice
			var list = $system.node.id($id + '_categories').childNodes; //Pick all the categories

			for(var i = 0; i < list.length; i++)
			{
				if(!$system.is.element(list[i], 'label')) continue; //Pick the 'label' elements
				var options = list[i].childNodes; //The inner child nodes

				for(var j = 0; j < options.length; j++)
				{
					//Add the chosen categories
					if($system.is.element(options[j], 'input') && options[j].checked) get.push(options[j].value);
				}
			}

			var clean = function(id, request)
			{
				$system.window.fade($id + '_edit_' + id, true, null, true); //Let go of the edit window
				delete __opened[id]; //Remove from list of opened windows

				log.user($global.log.notice, 'user/update', '', [form.name.value]);
				$self.item.get(); //Update the list
			}

			$system.network.send($self.info.root + 'server/php/front.php', {cat : get, task : 'item.set'}, param, $system.app.method(clean, [id]));
			return false;
		}
	}
