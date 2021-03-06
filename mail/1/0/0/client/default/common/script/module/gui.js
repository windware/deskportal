$self.gui = new function()
{
	var _class = $id + '.gui'

	var _attachment = 0 //Attachment file input form counter

	var _interval = 3 //Minutes of interval between each auto draft saving

	var _limit = 50 //Maximum search string length

	var _order = {} //Mail order for specific mail windows

	var _process = 0 //Amount of process to count to show the indicator

	var _quote = '> ' //Quote marker to use in reply

	var _reply = 'Re: ' //Marker to prepend on reply to subject

	var _state //Mail send/draft state

	var _submit = {} //Remember mail send form submission

	var _timer = {} //Auto draft save timer

	var _body = function(id, index, compose, field) //Create the mail window content
	{
		if(!$system.is.digit(id)) id = 0
		if(!id && !compose || !$system.is.digit(index)) return false

		var language = $system.language.strings($id)
		var section = ['from', 'to', 'cc', 'bcc']

		if(!compose) //For displaying the mail
		{
			var template = 'mail' //The HTML template to use
			var value = {
				id     : id,
				index  : index,
				account: __mail[id].account,
				sent   : $system.date.create(__mail[id].sent).format($global.user.pref.format.full),
				subject: $system.text.escape(__mail[id].subject) || '(' + language.empty + ')',
				reload : __mail[id].seen == '1' ? 0 : 1,
			}

			if(__mail[id].marked == '1') value.marked = ' checked="checked"'
			else value.unmarked = ' checked="checked"'

			var replace = function(phrase, match) { return variable[match] || '' }

			for(var i = 0; i < section.length; i++)
			{
				var list = __mail[id][section[i]]
				if(!$system.is.array(list)) continue

				var address = []

				for(var j = 0; j < list.length; j++)
				{
					var variable = {
						address: $system.text.escape(list[j].address),
						show   : $system.text.escape(list[j].name ? list[j].name : list[j].address),
						name   : list[j].name ? $system.text.escape(list[j].name) : '',
					}
					variable.tip = $system.tip.link($system.info.id, null, 'blank', [$system.text.escape(list[j].address)])

					address.push($self.info.template.address.replace(/%value:(.+?)%/g, replace))
				}

				value[section[i]] = address.join(', ')
			}

			var attachment = []

			for(var i = 0; i < __mail[id].attachment.length; i++)
			{
				var text = $system.text.template('<a class="%id%_mail_attachment" href="%%"%%>%%</a> (%%KB)', $id)
				var address = $system.network.form($self.info.root + 'server/php/run.php?task=gui._body.attachment&id=' + __mail[id].attachment[i].id)

				attachment.push($system.text.format(text, [address, $system.tip.link($id, null, 'attachment'), __mail[id].attachment[i].name, Math.ceil(__mail[id].attachment[i].size / 1000)]))
			}

			value.attachment = attachment.join(', ')
			value.body = $system.network.form($self.info.root + 'server/php/run.php?task=gui._body&message=' + id)
		}
		else //For composing the mail
		{
			var template = 'compose' //The HTML template to use
			var value = {
				id    : id,
				index : index,
				action: $system.network.form($self.info.root + 'server/php/run.php?task=gui.send'),
			}

			if(id) //Get values from the mail if specified
			{
				var account = __mail[id].account //The account the mail belongs to

				if($system.is.array(field) && field.length) //If the reply to address field is specified
				{
					var draft = $system.array.find(field, 'bcc') //If the field includes 'bcc', treat it as draft composing screen

					if(!draft) value.subject = _reply + __mail[id].subject.replace(/^\s*re\s*:\s*/i, '') //If not resuming a draft, put the reply marker after stripping the previous one
					else
					{
						value.subject = __mail[id].subject //Use the subject as is for resuming draft
						value.resume = id //Indicate this is resuming a previous draft
					}

					var section = ['from', 'to', 'cc', 'bcc']
					for(var i = 0; i < section.length; i++) value[section[i]] = []

					for(var i = 0; i < field.length; i++) //Grab the mail addresses from the specified fields
					{
						if(!$system.array.find(section, field[i]) || !__mail[id][field[i]]) continue

						var target = !draft ? 'to' : field[i] //For normal reply, set all of the addresses in the 'to' field
						var address = __mail[id][field[i]]

						for(var j = 0; j < address.length; j++)
						{
							if(address[j].name.length && address[j].name != address[j].address) value[target].push(address[j].name + ' <' + address[j].address + '>')
							else value[target].push(address[j].address) //Put the user name in front if it exists and is not same as the mail address
						}
					}

					value[target] = value[target].join(', ')
				}
				else value.subject = 'Fw : ' + __mail[id].subject //If forwarding, put the forward prefix
			}
			else var account = __selected.account ? __selected.account : __default //Pick the account to use

			for(var i in __account)
			{
				var selection = i == account ? ' selected="selected"' : ''
				value.account += $system.text.format('<option value="%%"%%>%% : %% (%%)</option>', [i, selection, __account[i].description, __account[i].name, __account[i].address])
			}
		}

		var replace = function(phrase, match) { return value[match] || value[match] == 0 ? value[match] : '' }
		return $self.info.template[template].replace(/%value:(.+?)%/g, replace)
	}

	var _insert = function(id, index, raw) //Load the message body for composing
	{
		if(!$system.is.digit(id) || !$system.is.digit(index)) return false
		if(!__mail[id] || !$system.node.id($id + '_compose_' + index + '_form')) return false

		var load = function(id, index, request) //Quote the source mail
		{
			var form = $system.node.id($id + '_compose_' + index + '_form')

			var sender = __mail[id].from[0] //Set the sender name
			sender = sender.name.length ? sender.name + ' (' + sender.address + ')' : sender.address

			var language = $system.language.strings($id)

			if(!raw) //When replying, quote the message
			{
				var source = _quote + language.from + ' : ' + sender + '\n' + _quote + language.date + ' : ' + __mail[id].sent + ' GMT'
				$system.node.text(form.body, '\n\n' + source + '\n' + _quote + '\n' + _quote + request.text.replace(/\n/g, '\n' + _quote)) //Fill the composing field with the mail quoted
			}
			else $system.node.text(form.body, request.text) //If resuming draft, display as is (FIXME - IE6 will have rendering corrupted on the textarea until redrawn)

			if(_timer[index])
			{
				clearInterval(_timer[index])
				delete _timer[index]
			}

			_timer[index] = setInterval($system.app.method($self.gui.save, [index]), _interval * 60 * 1000) //Set auto draft save on
		}

		//Load the plain text version of the mail
		return $system.network.send($self.info.root + 'server/php/run.php', {
			task: 'gui.compose',
			id  : id,
		}, null, $system.app.method(load, [id, index]))
	}

	this.cancel = function(index) //Cancel composing
	{
		if(!$system.is.digit(index)) return false

		var language = $system.language.strings($id)
		if(!confirm(language.discard)) return false

		return $system.window.fade($id + '_display_' + index, true, null, true)
	}

	this.check = function() //Select or deselect all mails
	{
		var form = $system.node.id($id + '_mail_list')
		var state = false //Wether to check or uncheck all checkboxes

		for(var i = 0; i < form.elements.length; i++)
		{
			if(form.elements[i].checked) continue

			state = true //If any of it is unchecked, try to check them all
			break
		}

		for(var i = 0; i < form.elements.length; i++) //Pick the mail ID and check the row
		{
			var id = form.elements[i].id.replace(RegExp('^' + $id + '_mail_(\\d+)_check$'), '$1')
			$self.item.select(id, state)
		}

		return true
	}

	this.complete = function(index, frame) //Called when the 'iframe' loads after sending the mail
	{
		var log = $system.log.init(_class + '.complete')

		if(!$system.is.digit(index) || !frame.contentWindow) return log.param()
		if(!frame.contentWindow.document.body || !_submit[index]) return false //Quit if never submitted

		var form = $system.node.id($id + '_compose_' + index + '_form')
		var state = frame.contentWindow.document.body.innerHTML

		if($system.is.digit(state, true) && state < 0) //If a negative number is returned indicating the mail ID that got created
		{
			form.resume.value = Math.abs(state) //Note about the ID of the mail on the server
			state = 0 //Imply sucess
		}

		if(!$system.is.digit(state)) state = 1

		var mode = $system.array.list('success error big smtp imap address')
		mode = mode[state] //Find out the status

		if(!mode) mode = 'error'
		$system.node.hide($id + '_compose_' + index + '_progress', true) //Hide the status message

		if(mode == 'success') //When succeeded
		{
			if(_state) mode = 'draft' //Show the draft saved message instead
			var update = __account[_submit[index].account].type == 'imap' ? 1 : 0

			if(_state != 2) $system.window.fade($id + '_display_' + index, true, null, true) //If not automatic saving, remove the composing window

			var target = _state ? 'drafts' : 'sent'
			var special = __special[target][_submit[index].account]

			if(special == __selected.folder) $self.item.update(update) //Update the folder
			else __update[special] = 1 //Or mark the folder to be updated on next access

			$self.folder.get(_submit[index].account, __account[_submit[index].account].type == 'imap' ? 1 : 2) //Update new mail count

			if(_submit[index].resume && __mail[_submit[index].resume]) //If resumed writing a draft
			{
				var home = __mail[_submit[index].resume].folder //The folder the mail belongs to

				if(special != home) //If the draft was placed not in the draft folder
				{
					if(home == __selected.folder) $self.item.update(update) //Update the folder
					else __update[home] = update //Or mark the folder to be updated on next access
				}
			}
		}
		else
		{
			if(_state && mode == 'error') mode = 'imap' //Show the draft error message instead

			for(var i = 0; i < form.elements.length; i++) form.elements[i].disabled = false //Enable the forms again
			if(!__account[form.account.value].signature.length) form.sign.disabled = true //Disable the signing button if no signature exists
		}

		return _state == 2 ? true : $system.gui.alert($id, 'user/gui/send/' + mode, 'user/gui/send/' + mode + '/message') //Show the status
	}

	this.compose = function(id, index, field) //Compose a mail
	{
		if(!$system.is.digit(index)) return $self.gui.show(id, true) //Create the mail window to compose if no window is specified
		if(!$system.is.digit(id) || !id) return false

		var node = $system.window.list[$id + '_display_' + index] //Window object
		if(!node) return false

		node.body.innerHTML = _body(id, index, true, field)
		$self.gui.signable(index)

		var form = $system.node.id($id + '_compose_' + index + '_form')

		if(!field.length) form.to.focus() //Put focus on the receiver address on forwarding
		else form.body.focus() //Put focus on the message for reply

		return id ? _insert(id, index) : true //Insert the reply text if ID is specified
	}

	this.create = function(account, subject, to, cc, bcc) //Create a new mail
	{
		var index = $self.gui.show(null, true)
		if(!index) return false

		var form = $system.node.id($id + '_compose_' + index + '_form')

		if($system.is.digit(account) && account) form.account.value = account
		if($system.is.text(subject)) form.subject.value = account //Set values

		var target = {to: to, cc: cc, bcc: bcc}

		for(var section in target) //Set the address fields
		{
			//NOTE : When an array is passed as a parameter from the child window, it loses 'instanceof Array' characteristics, while still holding 'length' attribute
			if(!$system.is.array(target[section]) && (!$system.is.object(target[section]) || !$system.is.digit(target[section].length))) continue
			var address = []

			for(var i = 0; i < target[section].length; i++) address.push(target[section][i])
			form[section].value = address.join(', ')
		}
	}

	this.extra = function(index) //Add Cc and Bcc fields
	{
		var log = $system.log.init(_class + '.extra')
		if(!$system.is.digit(index)) return log.param()

		$system.node.hide($id + '_compose_' + index + '_cc', false)
		$system.node.hide($id + '_compose_' + index + '_bcc', false)

		$system.node.hide($id + '_compose_' + index + '_extra', true)
	}

	this.file = function(index) //Load a new file field for attachment - TODO : Apply custom look (http://www.quirksmode.org/dom/inputfile.html)
	{
		var log = $system.log.init(_class + '.file')
		if(!$system.is.digit(index)) return log.param()

		var zone = $system.node.id($id + '_compose_' + index + '_attach') //Where attachment input forms get added
		if(!$system.is.element(zone)) return false

		var line = document.createElement('div')
		line.id = $id + '_compose_' + index + '_upload_' + (++_attachment)

		var loader = document.createElement('input') //Create the file input form element

		loader.type = 'file'
		loader.name = 'attachment_' + _attachment

		line.appendChild(loader)
		var cancel = document.createElement('img') //Create the button to remove the attachment

		cancel.onclick = $system.app.method($system.node.hide, [$id + '_compose_' + index + '_upload_' + _attachment, true, null, true]) //Remove the attachment line
		cancel.style.cursor = 'pointer'

		$system.tip.set(cancel, $id, 'remove')
		$system.image.set(cancel, $self.info.devroot + 'image/remove.png')

		line.appendChild(cancel)
		zone.appendChild(line)

		return true
	}

	this.filter = function(section, value) //Filters the list of mails
	{
		var log = $system.log.init(_class + '.filter')
		if(!__selected.folder) return false

		if(!$system.is.text(section)) return log.param()

		switch(section)
		{
			case 'search' :
				if(typeof value != 'string') return log.param()

				if(value.length == 1)
				{
					$system.gui.alert($id, 'user/gui/search/short', 'user/gui/search/short/solution', 3)
					return false
				}
				break

			case 'marked' :
			case 'unread' :
				if(typeof value != 'boolean') return log.param()
				break
		}

		__selected[section] = value
		return $self.item.update() //Update the listing
	}

	this.flip = function(page) //Change page
	{
		var log = $system.log.init(_class + '.flip')

		if(!$system.is.digit(__selected.folder)) return false
		if(!$system.is.digit(page)) return log.param()

		__page[__selected.folder] = page
		return $self.item.update()
	}

	this.format = function(body) //Turn links and mail addresses clickable
	{
		var log = $system.log.init(_class + '.format')
		if(!$system.is.element(body)) return log.param()

		var target = ['parent.window', $global.root, $id, 'gui.create(null, null, [\'%match%\'])'].join('.') //Target function to create a new mail
		body.innerHTML = $system.text.link($system.text.mail(body.innerHTML, target))

		return true
	}

	this.indicator = function(on) //Manage indicator to show progress
	{
		_process += on ? 1 : -1
		if(_process < 0) _process = 0

		return $system.node.id($id + '_indicator').style.visibility = _process ? '' : 'hidden'
	}

	this.load = function(id, index, reload, frame) //Loaded when the mail body loads in the mail window
	{
		var log = $system.log.init(_class + '.load')
		if(!$system.is.digit(id) || !$system.is.digit(index) || !$system.is.element(frame, 'iframe')) return log.param()

		var indicator = $system.node.id($id + '_mail_' + index + '_loading')
		if(!__mail[id] || !$system.is.element(indicator) || !frame.contentWindow) return false

		indicator.style.visibility = 'hidden' //Remove the loading indicator
		if(reload) $self.folder.get(__mail[id].account, __account[__mail[id].account].type == 'imap' ? 1 : 2) //Update the unread counts in the folder list if it was not yet read

		var inside = frame.contentWindow.document
		var image = inside.getElementsByTagName('img')

		for(var i = 0; i < image.length; i++)
		{
			var source = $system.network.form($self.info.root + 'server/php/run.php?task=gui.load&id=' + id + '&cid=$1')
			image[i].src = image[i].src.replace(/^cid:(.+)$/, source) //Set the embedded image target
		}

		if($system.browser.os != 'iphone') return true //For iPhone, wrap the content with a clipped container since size cannot be set on an iframe
		var node

		var zone = inside.createElement('div')
		zone.style.overflow = 'auto'

		while(node = inside.body.firstChild) zone.appendChild(node)

		zone.style.width = frame.clientWidth + 'px'
		zone.style.height = frame.clientHeight + 'px'

		inside.body.appendChild(zone)
		return true
	}

	this.next = function(id, index, distance) //Show next or previous mail
	{
		var log = $system.log.init(_class + '.next')
		if(!$system.is.digit(id) || !$system.is.digit(index) || !$system.is.digit(distance, true)) return log.param()

		if(!_order[index]) return false //If no order information is found, quit

		var node = $system.window.list[$id + '_display_' + index] //Window object
		if(!node) return false

		for(var i = 0; i < _order[index].length; i++)
		{
			if(id != _order[index][i]) continue //Find the current mail ID in the mail list

			var target = i //Current mail position
			do
			{ target += distance }
			while(target >= 0 && target < _order[index].length && !__mail[_order[index][target]])  //Find the next or previous mail until it finds one

			break
		}

		if(!__mail[_order[index][target]]) return true //If no mail is found, quit
		return node.body.innerHTML = _body(_order[index][target], index)
	}

	this.save = function(index) //Save the draft periodically
	{
		var log = $system.log.init(_class + '.save')
		if(!$system.is.digit(index)) return log.param()

		if(!$system.node.id($id + '_display_' + index)) //If the window is gone, clear the auto save timer
		{
			clearInterval(_timer[index])
			delete _timer[index]

			return false
		}

		var form = $system.node.id($id + '_compose_' + index + '_form')

		if(form.account.disabled) return false //If the form is disabled while being processed, quit
		if(form.subject.value == '' && form.to.value == '' && form.cc.value == '' && form.bcc.value == '' && form.body.value == '') return false //If nothing written yet, quit

		return $self.gui.send(index, 2) //Save the draft silently
	}

	this.send = function(index, draft) //Send the mail (Or save as a draft)
	{
		var form = $system.node.id($id + '_compose_' + index + '_form')
		if(!$system.is.element(form, 'form')) return false

		var section = ['to', 'cc', 'bcc']
		var warn = {} //The field with invalid parameters

		if(!$system.is.digit(form.account.value) || !form.account.value) warn.account = true //Check account selection
		var exist = false //Whether an address is specified or not

		for(var i = 0; i < section.length; i++) //Check on address fields
		{
			if(!draft && !form[section[i]].value.length) continue
			var address = form[section[i]].value.split(/\s*,\s*/)

			for(var j = 0; j < address.length; j++)
			{
				if(draft && !address[j].length || address[j].match(/.@./)) exist = true //Allow empty address under draft composition
				else warn[section[i]] = true
			}
		}

		if(!exist) warn.to = true //If no address is specified, warn on the 'to' field
		var attached = false //Whether file form exists or not

		for(var i = 0; i < form.elements.length; i++)
		{
			$system.node.classes(form.elements[i], $id + '_form_warn', !!warn[form.elements[i].name])
			if(form.elements[i].type == 'file') attached = true //Remember that attachments exist
		}

		for(var field in warn)
		{
			$system.gui.alert($id, 'user/gui/send/field', 'user/gui/send/field/message', 3)
			return false //If invalid fields exist, quit
		}

		var language = $system.language.strings($id)
		if(draft < 1) draft = false

		_submit[index] = {account: form.account.value, resume: form.resume.value} //Remember the form has been submitted and its values

		if(!draft)
		{ if(!confirm(language['confirm/send'])) return false } //Confirm when sending
		else if(draft != 2 && attached && !confirm(language['confirm/remove'])) return false //Confirm the removal of attachments when saving as draft

		var progress = $system.node.id($id + '_compose_' + index + '_progress')
		progress.innerHTML = language[draft ? 'saving' : 'sending']

		$system.node.hide($id + '_compose_' + index + '_progress', false) //Show the progress message
		form.draft.value = draft ? 1 : 0 //Indicate so when saving draft

		if(draft) for(var i = 0; i < form.elements.length; i++) if(form.elements[i].type == 'file') form.elements[i].disabled = true //Avoid attachments from being sent when saving drafts
		form.submit() //Submit the form directly inside an 'iframe' to have file uploading work

		if(draft) for(var i = 0; i < form.elements.length; i++) if(form.elements[i].type == 'file') form.elements[i].disabled = false
		if(draft != 2) for(var i = 0; i < form.elements.length; i++) form.elements[i].disabled = true //Disable the form from getting submitted multiple times

		_state = draft //Keep the process state
		return true
	}

	this.show = function(id, compose) //Display the mail window
	{
		var log = $system.log.init(_class + '.show')
		var field

		if(!$system.is.digit(id))
		{
			if(!compose) return log.param()

			id = null
			__window++ //Open a new window
		}
		else
		{
			if(!__mail[id]) return log.user($global.log.warning, 'user/show/error', 'user/show/solution')

			if(__mail[id].draft == '1')
			{
				compose = true //Start with composing mode if it is marked as a draft
				field = ['from', 'to', 'cc', 'bcc'] //Specify 'bcc' field to indicate it is a draft
			}

			$system.node.classes($id + '_mail_row_' + id, $id + '_mail_unread', false) //Remove the unread style
			_order[++__window] = __current.list //Remember the list order for this window
		}

		$system.window.create($id + '_display_' + __window, $self.info.title + ' [No. ' + (id || 0) + ']', _body(id, __window, compose, field), 'cccccc', 'ffffff', '000000', '333333', false, undefined, undefined, 600, undefined, false, true, true, null, null, true)

		if($system.is.digit(id) && __mail[id].seen != '1') //If mail is not read (NOTE : Waited till '_body' function processes using the 'seen' value)
		{
			__mail[id].seen = '1' //Mark it as read
			$system.network.send($self.info.root + 'server/php/run.php', {task: 'gui.show'}, {id: id}) //Mark the mail as read on the mail server
		}

		if(compose)
		{
			$self.gui.signable(__window) //Enable or disable signature button

			var form = $system.node.id($id + '_compose_' + __window + '_form')
			if(form.cc.value.length || form.bcc.value.length) $self.gui.extra(__window) //Show extra cc/bcc field if data exists

			if(id) _insert(id, __window, true) //Load the message body
			else _timer[__window] = setInterval($system.app.method($self.gui.save, [__window]), _interval * 60 * 1000) //Set auto draft save on

			//Move focus to the element not yet filled
			if(!form.subject.value.length) form.subject.focus()
			else if(!form.to.value.length) form.to.focus()
			else form.body.focus()
		}

		return __window //Return the window ID
	}

	this.sign = function(index, id) //Insert a signature at cursor position
	{
		var form = $system.node.id($id + '_compose_' + index + '_form')
		if(!__account[form.account.value]) return false

		var signature = '\n\n' + __account[form.account.value].signature
		if(!signature.match(/\S/)) return true

		form.body.focus()

		if(document.selection) document.selection.createRange().text = signature //For IE
		else if(form.body.selectionStart !== undefined)
		{
			var end = form.body.selectionEnd

			form.body.value = form.body.value.substring(0, form.body.selectionStart) + signature + form.body.value.substring(end, form.body.value.length) //Insert the signature
			form.body.setSelectionRange(end + signature.length, end + signature.length) //Set the cursor position to the end of the signature
		}
	}

	this.signable = function(index) //Enable or disable the signing button
	{
		var form = $system.node.id($id + '_compose_' + index + '_form')
		if(!__account[form.account.value]) return false

		var log = $system.log.init(_class + '.signable')
		if(!$system.is.digit(index)) return log.param()

		if(!$system.window.list[$id + '_display_' + index]) return false
		form.sign.disabled = !__account[form.account.value].signature.length //Disable the signing button if no signature exists
	}

	this.sort = function(section) //Sort the columns
	{
		var log = $system.log.init(_class + '.sort')
		if(!$system.is.text(section)) return log.param()

		__order = {item: section, reverse: __order.item == section && !__order.reverse} //Set order option

		__selected.order = __order.item
		__selected.reverse = __order.reverse

		$self.item.update() //Update the listing
		var header = $system.array.list('subject from sent')

		for(var i = 0; i < header.length; i++)
		{
			var sign = $system.node.id($id + '_sign_' + header[i])

			if(section != header[i]) sign.innerHTML = ''
			else sign.innerHTML = !__order.reverse ? ' &uarr;' : ' &darr;'
		}
	}
}
