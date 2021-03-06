$self.item = new function()
{
	var _class = $id + '.item'

	var _drag //The message drag parameter

	var _expire = 5 //Minute for IMAP folder freshness to expire

	var _float = 7 //Amount of pixels to move to trigger message move instead of displaying message when clicking and dragging them

	var _lock //Mail drag mouse move event throttling lock

	var _stack = {} //List of selected mails

	this.clear = function(id, folder) //Remove a mail from folder listing cache
	{
		var log = $system.log.init(_class + '.clear')

		if(!$system.is.digit(id) || !$system.is.digit(folder)) return log.param()
		if(!$system.is.object(__cache[folder])) return false

		var remove = function(cache) //Go through the cache listing
		{
			for(var section in cache)
			{
				if($system.is.array(cache[section])) //On the mail list, remove the mail entry
				{
					for(var i = 0; i < cache[section].length; i++) if(id == cache[section][i]) return delete cache[section][i]
				}
				else if($system.is.object(cache[section])) remove(cache[section])
			}
		}

		return remove(__cache[folder]) //NOTE : Likely to return 'undefined'
	}

	this.click = function(id) //Either start dragging the mail or display the message window
	{
		var log = $system.log.init(_class + '.click')
		if(!$system.is.array(id)) return log.param()

		$system.event.add(document.body, 'onmousemove', $self.item.drag) //Hook the event for mouse move
		$system.event.add(document.body, 'onmouseup', $self.item.drop) //Hook the event for mouse up

		var event = $system.event.source(arguments)
		var position = $system.event.position(event)

		_drag = {id: id, x: position.x, y: position.y}

		$system.browser.deselect() //Let go of selected text if any
		$system.gui.select(false) //Make sure text selection doesn't work while dragging

		event.cancelBubble = true
		return false //Avoid event success
	}

	this.drag = function(event) //Move the selected mails around
	{
		if(_lock) return true //If throttled, do not execute anything

		_lock = true //Lock for a short while
		setTimeout(function() { _lock = false }, $system.gui.interval) //Give a lock to throttle mouse move event from triggering as often as possible

		if(!event) event = window.event //NOTE : Not using 'event.source' for a possible performance reason
		if($system.browser.engine != 'khtml' && event.button != $system.browser.click.left) return $self.item.drop()

		var current = $system.event.position(event) //Get the cursor position

		if(!_drag.mover)
		{
			if(Math.abs(current.x - _drag.x) >= _float || Math.abs(current.y - _drag.y) >= _float)
			{
				_drag.mover = document.createElement('img')
				_drag.mover.id = $id + '_drag'

				_drag.mover.style.left = current.x + 5 + 'px'
				_drag.mover.style.top = current.y + 5 + 'px'

				$system.image.set(_drag.mover, $self.info.devroot + 'image/drag.png')
				_drag.mover.style.zIndex = ++$system.window.depth

				document.body.appendChild(_drag.mover)
			}
		}
		else
		{
			_drag.mover.style.left = current.x + 5 + 'px'
			_drag.mover.style.top = current.y + 5 + 'px'
		}

		return true
	}

	this.drop = function() //Move the message to a folder or display the message window
	{
		$system.event.remove(document.body, 'onmousemove', $self.item.drag) //Remove the mouse move event hook
		$system.event.remove(document.body, 'onmouseup', $self.item.drop) //Remove the mouse up event hook

		$system.gui.select(true) //Let texts become selectable again
		$system.node.fade($id + '_drag', true, null, true)

		if(!$system.is.array(_drag.id)) return false
		if(!_drag.mover) return $self.gui.show(_drag.id[0]) //If not dragging, display the message

		var list = $system.node.id($id + '_folder').childNodes //Folder lists

		for(var i = 0; i < list.length; i++)
		{
			//Check which folder is hilighted by style effect
			if(list[i].nodeType != 1 || list[i].nodeName != 'A' || !$system.node.classes(list[i], $id + '_hilight')) continue

			var target = list[i].id.replace(RegExp('^' + $id + '_folder_'), '')
			var folder = __mail[_drag.id[0]].folder //The folder the mail belongs to

			//Move the selected mails if targetting another folder
			if(target != folder) $self.item.move(_drag.id, target, $system.app.method($self.item.get, [folder, __page[folder], 0]))

			break //Only checking the target folder ID in the loop
		}

		_drag = undefined
		return true
	}

	this.get = function(folder, page, update, callback, request) //Get list of mails of a folder
	{
		var log = $system.log.init(_class + '.get')
		if(!$system.is.text(folder)) return log.param()

		if(!$system.is.digit(page) || !page) page = 1

		$self.gui.indicator(true) //Show indicator
		$system.node.hide($id + '_mail_empty', true, true) //Remove the empty notification

		var language = $system.language.strings($id)
		var table = $system.node.id($id + '_read_zone') //Mail listing table

		var list = function(folder, page, param, order, update, callback, request) //List the mails upon receiving the contents
		{
			if(!__cache[folder]) return false
			$self.gui.indicator(false) //Remove indicator

			var section = $system.array.list('subject to from cc bcc date') //List of data to cache
			var cache = __cache[folder][page][order.item][order.reverse][param.marked][param.unread][param.search] //Page listing cache

			if($system.is.object(request)) //If a new data is passed, create the cache
			{
				cache = __cache[folder][page][order.item][order.reverse][param.marked][param.unread][param.search] = {
					list: [],
					max : $system.dom.attribute($system.dom.tags(request.xml, 'page')[0], 'total'),
				}
				if(!$system.is.digit(cache.max) || !cache.max) cache.max = 1

				if($system.dom.status(request.xml) != '0') //Show message on error but do list if any data is returned
				{
					log.user($global.log.error, 'user/item/list/message', 'user/generic/again/solution', [__account[__belong[folder]].description])
					$system.gui.alert($id, 'user/item/list/title', 'user/item/list/message', undefined, null, [__account[__belong[folder]].description])

					delete __cache[folder][page][order.item][order.reverse][param.marked][param.unread][param.search] //Do not cache failed attempt
				}

				var all = $system.dom.tags(request.xml, 'mail')

				for(var i = 0; i < all.length; i++)
				{
					var id = $system.dom.attribute(all[i], 'id')
					cache.list.push(id) //List the mails in the page cache

					__mail[id] = {id: id, folder: folder, page: page}

					for(var j = 0; j < all[i].attributes.length; j++) //Keep mail attributes
					{
						var parameter = all[i].attributes[j]
						__mail[id][parameter.name] = parameter.value
					}

					for(var j = 0; j < section.length; j++) //For all the columns
					{
						switch(section[j])
						{
							case 'from' :
							case 'to' :
							case 'cc' :
							case 'bcc' :
								var address = $system.dom.tags(all[i], section[j])
								__mail[id][section[j]] = []

								for(var k = 0; k < address.length; k++) //Store all the address fields
									__mail[id][section[j]].push({
										address: $system.dom.attribute(address[k], 'address'),
										name   : $system.dom.attribute(address[k], 'name'),
									})
								break
						}
					}

					var attachment = $system.dom.tags(all[i], 'attachment')
					__mail[id].attachment = []

					var field = $system.array.list('id name size type')

					for(var j = 0; j < attachment.length; j++) //Store the attachments info
					{
						__mail[id].attachment[j] = {}
						for(var k = 0; k < field.length; k++) __mail[id].attachment[j][field[k]] = $system.dom.attribute(attachment[j], field[k])
					}

					__mail[id].preview = $system.dom.text($system.dom.tags(all[i], 'preview')[0])
				}
			}

			if(__account[__belong[folder]] && __account[__belong[folder]].type == 'imap') //Synchronize IMAP folder periodically
			{
				var expire = function(folder)
				{
					if(__selected.folder == folder) $self.item.update(1)
					else __update[folder] = 1
				}

				if(!__refresh[folder])
				{ if(update != 1) expire(folder) } //If never updated, synchronize once now
				else clearTimeout(__refresh[folder])

				__refresh[folder] = setTimeout($system.app.method(expire, [folder]), _expire * 60 * 1000)
			}

			//If displaying state changed, do not show it
			if(__selected.folder != folder || __page[folder] != page || __selected.marked != param.marked || __selected.unread != param.unread) return $system.app.callback(_class + '.get.list', callback)
			if(__selected.order != order.item || __selected.reverse != order.reverse || __selected.search != param.search) return $system.app.callback(_class + '.get.list', callback)

			__current = cache //Remember current listing

			if(parseInt(__page[folder], 10) > parseInt(cache.max, 10)) //If the chosen page exceeds the max page (Ex : After moving mails to another folder)
			{
				$system.node.id($id + '_show').value = cache.max
				__page[folder] = cache.max

				$self.item.update() //Show earlier page
				return $system.app.callback(_class + '.get.list', callback)
			}

			var select = $system.node.id($id + '_show')
			select.innerHTML = ''

			for(var i = 1; i <= cache.max; i++)
			{
				var option = document.createElement('option')

				option.value = i
				$system.node.text(option, i)

				select.appendChild(option)
			}

			select.value = page

			var row = document.createElement('tr')
			row.id = $id + '_read_header'

			$system.event.add(row, 'onmousedown', $system.app.method($system.event.cancel, [row]))
			var column = $system.array.list('check subject from date') //List of columns to display

			for(var i = 0; i < column.length; i++) //Create table header
			{
				var header = document.createElement('th')
				header.className = $id + '_row_' + column[i]

				var sort = column[i] == 'date' ? 'sent' : column[i]
				$system.tip.set(header, $id, 'sort/' + sort)

				header.style.cursor = 'pointer'
				header.onclick = column[i] != 'check' ? $system.app.method($self.gui.sort, [sort]) : $system.app.method($self.gui.check, [])

				$system.node.text(header, language[column[i]])

				var sign = document.createElement('span') //Create an area to put sort sign
				sign.id = $id + '_sign_' + sort

				if(sort == order.item) sign.innerHTML = !order.reverse ? ' &uarr;' : ' &darr;'

				header.appendChild(sign)
				row.appendChild(header)
			}

			var body = document.createElement('tbody')
			body.appendChild(row)

			for(var i = 0; i < cache.list.length; i++)
			{
				var mail = __mail[cache.list[i]] //Mail information cache
				if(!mail) continue //If the mail is deleted, ignore

				if(__selected.marked && mail.marked != '1' || __selected.unread && mail.seen == '1') continue //Leave out if the state has internally changed

				var row = document.createElement('tr')
				row.id = $id + '_mail_row_' + mail.id

				row.style.cursor = 'pointer'
				$system.node.hover(row, $id + '_hover') //Give mouse hovered style

				if(mail.seen != '1') $system.node.classes(row, $id + '_mail_unread', true) //For unread mails
				if(mail.marked == '1') $system.node.classes(row, $id + '_mail_marked', true) //For marked mails

				if(mail.replied == '1') $system.node.classes(row, $id + '_mail_replied', true) //For replied mails
				if(mail.draft == '1') $system.node.classes(row, $id + '_mail_draft', true) //For draft mails

				for(var j = 0; j < column.length; j++) //For all the columns
				{
					var display = ''
					var tip = ''

					switch(column[j]) //Pick the parameters to display on the interface
					{
						case 'check' :
							display = '<input id="%id%_mail_%%_check" type="checkbox" onclick="%top%.%id%.item.select(%%, this.checked)%cancel%" />'
							display = $system.text.template($system.text.format(display, [mail.id, mail.id]), $id)

							tip = ''
							break

						case 'subject' :
							if(mail.attachment.length)
							{
								var file = [] //List of attachment names and sizes
								for(var k = 0; k < mail.attachment.length; k++) file.push(mail.attachment[k].name + ' (' + Math.ceil(mail.attachment[k].size / 1000) + 'KB)')

								var values = [$system.image.source($id, 'attachment.png'), $system.info.id, $system.tip.link($system.info.id, null, 'blank', [file.join('\\n')], true)]
								display = $system.text.format('<img src="%%" style="cursor : help" class="%%_icon"%% /></span> ', values) //Show attachment presence
							}

							display += tip = $system.text.escape(mail[column[j]]) || '(' + language.empty + ')'
							break

						case 'date' :
							display = tip = $system.date.create(mail.sent).format($global.user.pref.format.monthdate)
							break

						case 'from' :
						case 'to' :
						case 'cc' :
						case 'bcc' : //Create mail addresses and concatenate
							display = []
							tip = []

							for(var k = 0; k < mail[column[j]].length; k++)
							{
								var address = mail[column[j]][k]
								var format = [$system.tip.link($system.info.id, null, 'blank', [$system.text.escape(address.address)]), $system.text.escape(address.name)]

								display.push(address.name ? $system.text.format('<span style="cursor : help"%%>%%</span>', format) : $system.text.escape(address.address))
								tip.push(address.name ? $system.text.escape(address.name) + ' (' + $system.text.escape(address.address) + ')' : $system.text.escape(address.address))
							}

							display = display.join(', ')
							tip = tip.join(', ')
							break

						default :
							continue
							break
					}

					var cell = document.createElement('td')
					cell.innerHTML = display

					if(column[j] == 'check') //The checkbox cell
					{
						cell.onmousedown = $system.app.method($system.event.cancel, [cell])
						cell.onclick = $system.app.method($self.item.select, [mail.id])
					}
					else cell.onmousedown = $system.app.method($self.item.click, [[mail.id]]) //Either start moving mail or display mail content

					row.appendChild(cell)
				}

				$system.tip.set(row, $system.info.id, 'blank', [$system.text.escape(mail.preview) || '(' + language.empty + ')'], true) //Give message preview tip
				body.appendChild(row)
			}

			while(table.firstChild) table.removeChild(table.firstChild) //Clean up the listing (innerHTML on table breaks khtml)
			table.appendChild(body)

			for(var i = 0; i < cache.list.length; i++) if(_stack[cache.list[i]]) $self.item.select(cache.list[i], true) //Check selected mails

			if(__update[folder] !== undefined) //If cache should be updated - TODO : May be better to only delete cache for specific setting
			{
				var mode = __update[folder]

				delete __cache[folder] //Remove the entire cache for the folder
				delete __update[folder]

				$self.item.get(folder, __page[folder], mode) //Update it
			}

			return $system.app.callback(_class + '.get.list', callback)
		}

		//Create cache storage
		if(!__cache[folder]) __cache[folder] = {}
		if(!__cache[folder][page]) __cache[folder][page] = {}
		if(!__cache[folder][page][__order.item]) __cache[folder][page][__order.item] = {}
		if(!__cache[folder][page][__order.item][__order.reverse]) __cache[folder][page][__order.item][__order.reverse] = {}

		var hash = __cache[folder][page][__order.item][__order.reverse] //A shortcut

		if(!hash[__selected.marked]) hash[__selected.marked] = {}
		if(!hash[__selected.marked][__selected.unread]) hash[__selected.marked][__selected.unread] = {}

		var run = $system.app.method(list, [folder, page, __selected, __order, update, callback])

		if($system.is.object(request)) return run(request) //If updating, use the passed object
		if(!$system.is.digit(update) && $system.is.object(hash[__selected.marked][__selected.unread][__selected.search])) return run(null) //If already cached, use it

		var value = {
			task   : 'item.get',
			folder : folder,
			page   : page,
			order  : __order.item,
			reverse: __order.reverse ? 1 : 0,
			marked : __selected.marked ? 1 : 0,
			unread : __selected.unread ? 1 : 0,
			search : __selected.search,
			update : $system.is.digit(update) ? update : 0,
		}
		return $system.network.send($self.info.root + 'server/php/run.php', value, null, run)
	}

	this.mark = function(id, mode) //Flag a mail as marked or not
	{
		var log = $system.log.init(_class + '.mark')
		if(!$system.is.array(id)) return log.param()

		var notify = function(request) //Show result
		{
			if($system.dom.status(request.xml) == '0')
			{
				var message = [$global.log.notice, 'user/item/mark']
				delete __cache[__mail[id].folder] //Remove the entire cache for the folder

				__mail[id].marked = mode ? 1 : 0
				$system.node.classes($id + '_mail_row_' + id, $id + '_mail_marked', !!mode) //Change the style
			}
			else var message = [$global.log.error, 'user/item/mark/error', 'user/generic/again/solution']

			log.user(message[0], message[1], message[2])
		}

		return $system.network.send($self.info.root + 'server/php/run.php', {task: 'item.mark'}, {
			id  : id,
			mode: mode ? 1 : 0,
		}, notify)
	}

	this.move = function(id, folder, callback) //Move the mails to another folder
	{
		var log = $system.log.init(_class + '.move')
		if(!$system.is.array(id) || !$system.is.digit(folder)) return log.param()

		var notify = function(folder, reload, callback)
		{
			__update[folder] = __account[__belong[folder]].type == 'imap' ? 1 : 0 //Set the target folder for update on next access

			//Update the unread mail counts ('update' mode 2 will update the folder unread count but not access the POP3 server to avoid extra overhead)
			if(reload) $self.folder.get(__belong[folder], __account[__belong[folder]].type == 'imap' ? 1 : 2)

			$system.app.callback(_class + '.move.notify', callback)
		}

		var group = false //Whether to send the other selected mails or not
		var reload = false //Whether to get new unread message count from the mail server after move or not

		for(var i = 0; i < id.length; i++)
		{
			var mail = __mail[id[i]]
			if(!mail) continue

			$self.item.clear(id[i], mail.folder) //Remove the mail from the folder listing
			$system.node.hide($id + '_mail_row_' + id[i], true, true) //Remove from the interface

			if(mail.seen != '1') reload = true //If moving unread mails, prepare to upload folder's unread mail count
			if(_stack[id[i]]) group = true //If within the selected items, move others too
		}

		if(group)
		{
			for(var index in _stack)
			{
				var mail = __mail[index]
				if(!mail) continue

				$self.item.clear(index, mail.folder) //Remove the mail from the folder listing
				$system.node.hide($id + '_mail_row_' + index, true, true) //Remove from the interface

				if(mail.seen != '1') reload = true //If moving unread mails, prepare to upload folder's unread mail count

				delete _stack[index]
				id.push(index)
			}
		}

		return $system.network.send($self.info.root + 'server/php/run.php', {task: 'item.move'}, {
			id    : $system.array.unique(id),
			folder: folder,
		}, $system.app.method(notify, [folder, reload, callback]))
	}

	this.select = function(id, checked) //Add a mail to the selection
	{
		var log = $system.log.init(_class + '.select')
		if(!$system.is.digit(id)) return log.param()

		var box = $system.node.id($id + '_mail_' + id + '_check')
		box.checked = typeof checked == 'boolean' ? checked : !box.checked

		$system.node.classes($id + '_mail_row_' + id, $id + '_selected', box.checked)

		if(box.checked) _stack[id] = true
		else delete _stack[id]

		return true
	}

	this.show = function(id) //Show the mail by ID (Also loads the account and folder)
	{
		var log = $system.log.init(_class + '.show')
		if(!$system.is.digit(id)) return log.param()

		var reset = function(account, folder, id, page) //Reset filters, search and sorting
		{
			//Remove filters to avoid filtering the mail out
			$system.node.id($id + '_marked').checked = $system.node.id($id + '_unread').checked = false
			$system.node.id($id + '_form').search.value = '' //Remove search criteria

			__order = {item: 'sent', reverse: true} //Set ordering back to default

			var load = function(id, folder, page) //Load the page where the mail is
			{
				var align = function(id) //Scroll to where the mail is
				{
					var form = $system.node.id($id + '_mail_list')
					var row = $system.node.id($id + '_mail_row_' + id)

					if(!$system.is.element(form) || !$system.is.element(row)) return false
					form.scrollTop = row.offsetTop
				}

				return $self.item.get(__selected.folder = folder, __page[__selected.folder] = page, false, $system.app.method(align, [id]))
			}

			return $self.account.change(account, folder, $system.app.method(load, [id, folder, page])) //TODO : It should be able to directly load a specific page directly
		}

		if(__mail[id]) return reset(__mail[id].account, __mail[id].folder, id, __mail[id].page) //If mail is already loaded, change to the folder where the mail belongs to

		var load = function(request)
		{
			if($system.dom.status(request.xml) != '0') return $system.gui.alert($id, 'user/item/show', 'user/item/show/error')
			var mail = $system.dom.tags(request.xml, 'mail')[0] //Load the account and folder where the mail belongs to

			return reset($system.dom.attribute(mail, 'account'), $system.dom.attribute(mail, 'folder'), id, $system.dom.attribute(mail, 'page'))
		}

		return $system.network.send($self.info.root + 'server/php/run.php', {task: 'item.show', id: id}, null, load) //Consult the account and folder of the mail
	}

	this.trash = function(id, index) //Trash mails
	{
		var log = $system.log.init(_class + '.remove')
		if(!$system.is.digit(id) || !$system.is.digit(index)) return log.param()

		var refresh = function(folder, mode) { return __selected.folder == folder ? $self.item.get(folder, __page[folder], mode) : __update[folder] = mode } //Update the folder

		var update = function(account, folder, request)
		{
			if($system.dom.status(request.xml) != '0')
			{
				refresh(folder, 0) //Recover the mail that failed to be trashed
				return log.user($global.log.error, 'user/item/delete', 'user/generic/again/solution')
			}

			return refresh(__special.trash[account], 1) //Update the trash
		}

		$system.node.fade($id + '_display_' + index, true, null, true) //Remove mail window
		if(!__mail[id]) return false

		var folder = __mail[id].folder //Originating folder

		$self.item.clear(id, folder) //Remove the mail from the folder listing
		refresh(folder) //Update the origin folder

		return $system.network.send($self.info.root + 'server/php/run.php', {task: 'item.trash'}, {id: [id]}, $system.app.method(update, [__mail[id].account, folder]))
	}

	this.update = function(mode) //Reload the mail listing
	{
		return $system.is.digit(__selected.folder) ? $self.item.get(__selected.folder, __page[__selected.folder], mode) : false
	}
}
