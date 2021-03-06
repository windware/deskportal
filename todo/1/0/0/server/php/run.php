<?php
$system = new System_1_0_0(__FILE__);
$system->cache_header(0); #Do not cache any of the results

switch($_GET['task'])
{
	case 'category.get' : #Get the list of categories
		$data = Todo_1_0_0_Category::get();
		print $system->xml_dump($data !== false, 'category', $data, ['user']);
	break;

	case 'category.remove' : #Remove a category
		$result = Todo_1_0_0_Category::remove($_POST['category']);
		$data = Todo_1_0_0_Category::get();

		print $system->xml_dump($result && $data !== false, 'category', $data, ['user']);
	break;

	case 'category.set' : #Submit the category changes
		$result = Todo_1_0_0_Category::set($_POST['name'], $_POST['id']);
		$data = Todo_1_0_0_Category::get();

		print $system->xml_dump($result && $data !== false, 'category', $data, ['user']);
	break;

	case 'item.add' : #Add an entry
		$result = Todo_1_0_0_Item::add($_POST['name'], $_POST['category']);
		print $system->xml_dump($result);
	break;

	case 'item.get' : #Get all entries
		$data = Todo_1_0_0_Item::get($_GET['filter']);

		if(is_array($data)) foreach($data as $row) $list .= $system->xml_node('item', $row, $system->xml_data($row['content']), ['content', 'user']);
		print $system->xml_send($data !== false, $list);
	break;

	case 'item.remove' : #Remove an entry
		$result = Todo_1_0_0_Item::remove($_POST['id']);
		print $system->xml_dump($result);
	break;

	case 'item.set' : #Set an entry
		$result = Todo_1_0_0_Item::set($_POST['id'], $_POST['title'], $_POST['content'], $_POST['category'], $_POST['status'], $_POST['year'], $_POST['month'], $_POST['day'], $_POST['hour'], $_POST['minute']);
		print $system->xml_dump($result);
	break;
}
?>
