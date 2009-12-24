<?php
	$system = new System_1_0_0(__FILE__);
	$system->cache_header(0); #Avoid caching server response (Cache on client side instead)

	switch($_GET['task'])
	{
		case 'conf.account' : #Save account information
			$option = $_POST;
			unset($option['account']);

			print $system->xml_send(Mail_1_0_0_Account::save($_POST['account'], $option));
		break;

		case 'account.get' : #Get list of accounts
			$data = Mail_1_0_0_Account::get();
			print $system->xml_send($data !== false, $data);
		break;

		case 'folder.get' : case 'folder.update' : #Get list of folders for an account
			$data = Mail_1_0_0_Folder::get($_GET['account']);
			print $system->xml_send($data !== false, $data);
		break;

		case 'item.get' : #Get list of mails stored in the database
			if($_GET['update']) $update = Mail_1_0_0_Item::update($_GET['folder']); #Update it from the mail server
			$data = Mail_1_0_0_Item::get($_GET['folder'], $_GET['page'], $_GET['order'], $_GET['reverse']); #Get list from database

			print $system->xml_send($update !== false && $data !== false, $data, null, true);
		break;

		case 'item.show' : #Get message body of a mail #TODO - Send caching header
			$data = Mail_1_0_0_Item::show($_GET['message']);
			print $system->xml_send($data !== false, $data, null, true);
		break;
	}
?>