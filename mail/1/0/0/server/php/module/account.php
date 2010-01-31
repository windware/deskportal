<?php
	class Mail_1_0_0_Account
	{
		private static $_stream = array(); #Mail server connection cache

		public static function connect($account, $folder = null, System_1_0_0_User $user = null) #Connect to the mail server of an account
		{
			$system = new System_1_0_0(__FILE__);
			$log = $system->log(__METHOD__);

			if(!$system->is_digit($account) || !$system->is_digit($folder) && $folder) return $log->param();

			if($user === null) $user = $system->user();
			if(!$user->valid) return false;

			$database = $system->database('user', __METHOD__, $user);
			if(!$database->success) return false;

			$name = $system->is_digit($folder) ? Mail_1_0_0_Folder::name($folder) : ''; #Convert it into textual name

			$query = $database->prepare("SELECT * FROM {$database->prefix}account WHERE id = :id AND user = :user");
			$query->run(array(':id' => $account, ':user' => $user->id));

			if(!$query->success) return false;

			$info = $query->row();
			$type = self::type($info['receive_type']);

			#Create connection parameters
			$host = "{$info['receive_host']}:{$info['receive_port']}";
			$secure = $info['receive_secure'] ? '/ssl' : '';

			$parameter = "{{$host}/$type/novalidate-cert$secure}";
			$conf = $system->app_conf('system', 'static');

			if(self::$_stream[$user->id][$account]) #If a connection already exists for the account
			{
				if(self::$_stream[$user->id][$account]['folder'] != $folder) #If the folder is different
				{
					$op = imap_reopen(self::$_stream[$user->id][$account]['connection'], $parameter.mb_convert_encoding($name, 'UTF7-IMAP', 'UTF-8')); #Open that folder
					if(!$op) return Mail_1_0_0_Account::error($host);

					self::$_stream[$user->id][$account]['folder'] = $folder;
				}

				return self::$_stream[$user->id][$account]; #Return the cached connection information
			}

			foreach(array(IMAP_OPENTIMEOUT, IMAP_READTIMEOUT, IMAP_WRITETIMEOUT, IMAP_CLOSETIMEOUT) as $section)
				if(!imap_timeout($section, $conf['net_timeout'])) return false; #Set the timeout value

			$connection = imap_open($parameter.mb_convert_encoding($name, 'UTF7-IMAP', 'UTF-8'), $info['receive_user'], $info['receive_pass']);
			if(!$connection) return Mail_1_0_0_Account::error($host);

			unset($info['receive_pass'], $info['send_pass']); #Remove sensitive information
			return self::$_stream[$user->id][$account] = array('connection' => $connection, 'folder' => $folder, 'host' => $host, 'parameter' => $parameter, 'info' => $info, 'type' => $type);
		}

		public static function error($host) #Log IMAP errors
		{
			$system = new System_1_0_0(__FILE__);
			$log = $system->log(__METHOD__);

			return $log->dev(LOG_ERR, "IMAP error on '$host' : ".imap_last_error(), 'Check the error');
		}

		public static function get($account = null, System_1_0_0_User $user = null) #Get account information
		{
			$system = new System_1_0_0(__FILE__);

			if($user === null) $user = $system->user();
			if(!$user->valid) return false;

			$database = $system->database('user', __METHOD__, $user);
			if(!$database->success) return false;

			$param = array(':user' => $user->id);

			if($system->is_digit($account))
			{
				$limit = " id = :id AND";
				$param[':id'] = $account;
			}

			$query = $database->prepare("SELECT * FROM {$database->prefix}account WHERE$limit user = :user ORDER BY LOWER(description)");
			$query->run($param);

			if(!$query->success) return false;
			$list = array();

			foreach($query->all() as $row)
			{
				$row['signature'] = str_replace("\n", '\\n', $row['signature']);
				$row['type'] = self::type($row['receive_type']);

				unset($row['receive_pass'], $row['send_pass']); #Remove user passwords
				$list[] = $row;
			}

			return $list;
		}

		public static function remove($id, System_1_0_0_User $user = null) #Remove an account
		{
			$system = new System_1_0_0(__FILE__);
			$log = $system->log(__METHOD__);

			if(!$system->is_digit($id)) return $log->param();

			if($user === null) $user = $system->user();
			if(!$user->valid) return false;

			$database = $system->database('user', __METHOD__, $user);
			if(!$database->success) return false;

			if(!$database->begin()) return false;

			$query = $database->prepare("DELETE FROM {$database->prefix}account WHERE id = :id AND user = :user");
			$query->run(array(':id' => $id, ':user' => $user->id)); #Remove the account

			if(!$query->success) return $database->rollback() && false;

			$query = $database->prepare("DELETE FROM {$database->prefix}loaded WHERE user = :user AND account = :account");
			$query->run(array(':user' => $user->id, ':account' => $id)); #Remove the POP3 download history

			if(!$query->success) return $database->rollback() && false;

			$query = $database->prepare("SELECT id FROM {$database->prefix}folder WHERE user = :user AND account = :account");
			$query->run(array(':user' => $user->id, ':account' => $id)); #Find the folders

			if(!$query->success) return $database->rollback() && false;

			$folder = array(); #Folder list
			foreach($query->all() as $row) $folder[] = $row['id'];

			$query = $database->prepare("DELETE FROM {$database->prefix}folder WHERE user = :user AND account = :account");
			$query->run(array(':user' => $user->id, ':account' => $id)); #Remove the folders

			if(!$query->success) return $database->rollback() && false;
			$mail = array(); #Mail list

			for($i = 0; $i < count($folder); $i += Mail_1_0_0_Item::$_limit)
			{
				$param = array(':user' => $user->id);
				$target = array();

				foreach(array_slice($folder, $i, Mail_1_0_0_Item::$_limit) as $index => $id)
				{
					$value = $target[] = ":i{$index}d";
					$param[$value] = $id;
				}

				$target = implode(', ', $target);

				$query = $database->prepare("SELECT id FROM {$database->prefix}mail WHERE user = :user AND folder IN ($target)");
				$query->run($param); #Find the mails

				if(!$query->success) return $database->rollback() && false;
				foreach($query->all() as $row) $mail[] = $row['id'];

				$query = $database->prepare("DELETE FROM {$database->prefix}mail WHERE user = :user AND folder IN ($target)");
				$query->run($param); #Delete the mails

				if(!$query->success) return $database->rollback() && false;
			}

			for($i = 0; $i < count($mail); $i += Mail_1_0_0_Item::$_limit)
			{
				$param = $target = array();

				foreach(array_slice($mail, $i, Mail_1_0_0_Item::$_limit) as $index => $id)
				{
					$value = $target[] = ":i{$index}d";
					$param[$value] = $id;
				}

				$target = implode(', ', $target);

				foreach(explode(' ', 'from to cc attachment reference') as $section)
				{
					$query = $database->prepare("DELETE FROM {$database->prefix}$section WHERE mail IN ($target)");
					$query->run($param); #Delete mail related data

					if(!$query->success) return $database->rollback() && false;
				}

				$query = $database->prepare("DELETE FROM {$database->prefix}reference WHERE reference IN ($target)");
				$query->run($param); #Delete mail referer

				if(!$query->success) return $database->rollback() && false;
			}

			return $database->commit() || $database->rollback() && false;
		}

		public static function set($id, $param, System_1_0_0_User $user = null) #Save the account information
		{
			$system = new System_1_0_0(__FILE__);
			$log = $system->log(__METHOD__);

			if(!$system->is_digit($id) || !is_array($param)) return $log->param();

			if($user === null) $user = $system->user();
			if(!$user->valid) return false;

			$database = $system->database('user', __METHOD__, $user);
			if(!$database->success) return false;

			foreach(array(IMAP_OPENTIMEOUT, IMAP_READTIMEOUT, IMAP_WRITETIMEOUT, IMAP_CLOSETIMEOUT) as $section)
				if(!imap_timeout($section, $system->app_conf('system', 'static', 'net_timeout'))) return false; #Set the timeout value

			#Connect to read mail server and check for availability
			$host = "{$param['receive_host']}:{$param['receive_port']}";
			$secure = $param['receive_secure'] ? '/ssl' : '';

			$parameter = "{{$host}/".self::type($param['receive_type'])."/novalidate-cert$secure}";

			$connection = imap_open($parameter, $param['receive_user'], $param['receive_pass']);
			if(!$connection) return 2;

			imap_close($connection);
			if(!$system->file_load('Net/SMTP.php')) return false; #Load the PEAR package for SMTP connection

			$secure = $param['send_secure'] ? 'ssl://' : '';
			$smtp = new Net_SMTP($secure.$param['send_host'], $param['send_port'], $param['send_host']);

			$connect = $smtp->connect(); #Connect and check for send server availability
			if($connect === true && strlen($param['send_user']) || strlen($param['send_pass'])) $connect = $smtp->auth($param['send_user'], $param['send_pass']);

			$smtp->disconnect();
			if($connect !== true) return 3; #Connect and check for availability on send mail server

			$param['user'] = $user->id;
			$data = $name = $variable = array();

			foreach($param as $key => $value)
			{
				if(preg_match('/\W/', $key) || !is_string($value)) continue;

				if($id == 0)
				{
					$name[] = $key;
					$variable[] = ":$key";
				}
				else $name[] = "$key = :$key";

				$data[":$key"] = $value;
			}

			$name = implode(', ', $name);
			if(!$database->begin()) return false;

			$query = $database->prepare("SELECT count(id) FROM {$database->prefix}account WHERE id != :id AND user = :user AND base = :base");
			$query->run(array(':id' => $id, ':user' => $user->id, ':base' => 1)); #Find any default accounts

			if(!$query->success) return $database->rollback() && false;
			if(!$query->column()) $data[':base'] = 1; #If no other default accounts are set, force it to be default

			if($data[':base']) #If a new default account is set
			{
				$query = $database->prepare("UPDATE {$database->prefix}account SET base = :base WHERE user = :user");
				$query->run(array(':base' => 0, ':user' => $user->id)); #Reset the previous default account

				if(!$query->success) return $database->rollback() && false;
			}

			if($id == 0) #Insert new account data
			{
				$variable = implode(', ', $variable);

				$query = $database->prepare("INSERT INTO {$database->prefix}account ($name) VALUES ($variable)");
				$query->run($data);

				if(!$query->success) return $database->rollback() && false;
				$id = $database->id();
			}
			else #Edit current account data
			{
				$data[':id'] = $id;

				$query = $database->prepare("UPDATE {$database->prefix}account SET $name WHERE id = :id AND user = :user");
				$query->run($data);

				if(!$query->success) return $database->rollback() && false;
			}

			if(!$database->commit()) return $database->rollback() && false;
			if($id == 0) Mail_1_0_0_Folder::update($id); #Update the folder listing on a new account

			$query = $database->prepare("SELECT folder_inbox, folder_drafts, folder_sent, folder_trash FROM {$database->prefix}account WHERE id = :id AND user = :user");
			$query->run(array(':id' => $id, ':user' => $user->id));

			if(!$query->success) return false;

			$account = $query->row();
			$query = array('select' => $database->prepare("SELECT id FROM {$database->prefix}folder WHERE user = :user AND account = :account AND name LIKE :name"));

			foreach(explode(' ', 'inbox drafts sent trash') as $name) #Look for special folders - TODO - Look for special folders that got created by several other clients (ex : Deleted Messages, Sent Messages)
			{
				if($system->is_digit($account["folder_$name"])) continue; #Ignore if already set

				$query['select']->run(array(':user' => $user->id, ':account' => $id, ':name' => $name)); #Look for special named folders
				if(!$query['select']->success) return false;

				if(!$system->is_digit($folder = $query['select']->column()))
				{
					$folder = Mail_1_0_0_Folder::create($id, null, $name == 'inbox' ? 'INBOX' : ucfirst($name), $user); #Create one if missing
					if(!$folder) continue;
				}

				$query['update'] = $database->prepare("UPDATE {$database->prefix}account SET folder_$name = :folder WHERE id = :id AND user = :user");
				$query['update']->run(array(':folder' => $folder, ':id' => $id, ':user' => $user->id)); #Remember the special folder ID

				if(!$query['update']->success) return false;
			}

			return true;
		}

		public static function type($type) #Return the connection type by account type
		{
			switch($type)
			{
				case 'pop3' : case 'hotmail' : return 'pop3'; break;

				case 'imap' : case 'gmail' : return 'imap'; break;

				default : return false; break;
			}
		}
	}
?>
