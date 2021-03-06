<?php

class System_1_0_0_Image
{
	protected static $_border = 1; //Border width

	protected static $_depth = 70; //Shadow color depth (0 to 127)

	protected static $_through = 50; //Transparency (0 to 127)

	protected static $_zoom = 50; //Zoom level to apply resampling on rounded corners to smooth the round

	protected static $_thumbnail = [120, 90]; //Dimension for a thumbnail

	protected static function _resample(&$image, &$canvas_x, &$canvas_y, &$size_x, &$size_y) //Sample the size down
	{
		$resample = imagecreatetruecolor($canvas_x / self::$_zoom, $canvas_y / self::$_zoom); //Create the resampled image

		imagealphablending($resample, false);
		imagesavealpha($resample, true);

		//Copy the created pie to the resampled original size to smooth out the corner
		imagecopyresampled($resample, $image, 0, 0, 0, 0, $canvas_x / self::$_zoom, $canvas_y / self::$_zoom, $canvas_x, $canvas_y);

		imagedestroy($image); //Avoid possible memory leak
		$image = $resample;

		$canvas_x /= self::$_zoom;
		$canvas_y /= self::$_zoom;

		$size_x /= self::$_zoom;
		$size_y /= self::$_zoom;
	}

	//FIXME - Changing 'shadow' parameter breaks the image
	//TODO - Use sprite technique to send out 4 corners as a single image
	public static function background(&$system, $param) //Creates a window's translucent background graphic piece according to the given parameters
	{
		$log = $system->log(__METHOD__);

		//Positions are in combination of "Top/Center/Bottom" and "Left/Middle/Right" of 9 cells in a window
		if(!preg_match('/^[tcb][lmr]$/', $param['place']) && $param['place'] != 'circle' || !preg_match('/^([a-f\d]{6})$/i', $param['background'])) return $log->param();
		if($param['round'] != 0 && $param['round'] != 1) return $log->param();

		if(!$system->is_color($param['color']) || !$system->is_color($param['background']) || !$system->is_color($param['border'])) return $log->param();
		if(!$system->is_digit($param['shadow']) || !$system->is_digit($param['shadow'])) return $log->param();

		$through = $system->is_digit($param['through']) ? 100 - $param['through'] : self::$_through; //Set transparency
		if($through > 100 || $through < 0) return false;

		ksort($param); //Sort the keys

		$id = '';
		foreach($param as $key => $value) $id .= "$key=$value&";

		$id = 'pane/' . md5($id) . '.png'; //Create a unique name from the query string for cache purpose
		if($built = $system->cache_get($id, false, $system->system['id'])) return $built; //Use cache if it exists

		//Calculate the background color in hex format
		$color = [hexdec(substr($param['background'], 0, 2)), hexdec(substr($param['background'], 2, 2)), hexdec(substr($param['background'], 4))];

		//Calculate the border outline color in hex format
		$outline = [hexdec(substr($param['border'], 0, 2)), hexdec(substr($param['border'], 2, 2)), hexdec(substr($param['border'], 4))];

		//Calculate the foreground color in hex format
		$mark = [hexdec(substr($param['color'], 0, 2)), hexdec(substr($param['color'], 2, 2)), hexdec(substr($param['color'], 4))];

		switch($param['place']) //Depending on the specified location
		{
			case 'circle' : //A single circle
				$canvas_x = $canvas_y = $param['edge'] * 2;
				$size_x = $size_y = $param['edge'] * 2;

				$start_x = $start_y = $param['edge'];
			break;

			case 'tl' : //Top left
				$canvas_x = $canvas_y = $param['edge']; //Set the width and height of the image
				$size_x = $size_y = $param['edge']; //Size of the image without the shadows

				if($param['round']) //For rounded corners
				{
					$angle = 180; //Specify the rotation angle for that given piece of the quarter pie
					$start_x = $start_y = $param['edge']; //Set the position of the pie
				}
				else $start_x = $start_y = self::$_border; //Position adjustments for making borders
			break;

			case 'tr' : //Top right
				$canvas_x = $size_x = $param['edge'];
				$canvas_y = $size_y = $param['edge'];

				$canvas_x += $param['shadow']; //Extend the image canvas by the size of the shadow

				if($param['round'])
				{
					$angle = 270;

					$start_x = 0;
					$start_y = $param['edge'];
				}
				else $start_y = $end_x = self::$_border;
			break;

			case 'bl' : //Bottom Left
				$canvas_x = $size_x = $param['edge'];
				$canvas_y = $size_y = $param['edge'];

				$canvas_y += $param['shadow'];

				if($param['round'])
				{
					$angle = 90;

					$start_x = $param['edge'];
					$start_y = 0;
				}
				else $start_x = $end_y = self::$_border;
			break;

			case 'br' : //Bottom right
				$canvas_x = $size_x = $param['edge'];
				$canvas_y = $size_y = $param['edge'];

				$canvas_x += $param['shadow'];
				$canvas_y += $param['shadow'];

				if($param['round'])
				{
					$angle = 0;
					$start_x = $start_y = 0;
				}
				else $end_x = $end_y = self::$_border;
			break;

			case 'tm' : //Top middle
				$canvas_x = $size_x = 1; //Make 1px image repeat inside the browser
				$canvas_y = $size_y = $param['edge'];

				$start_y = self::$_border;
			break;

			case 'cl' : //Center left
				$canvas_x = $size_x = $param['edge'];
				$canvas_y = $size_y = 1;

				$start_x = self::$_border;
			break;

			case 'cr' : //Center right
				$canvas_x = $size_x = $param['edge'];
				$canvas_y = $size_y = 1;

				$canvas_x += $param['shadow'];
				$end_x = self::$_border;
			break;

			case 'bm' : //Bottom middle
				$canvas_x = $size_x = 1;
				$canvas_y = $size_y = $param['edge'];

				$canvas_y += $param['shadow'];
				$end_y = self::$_border;
			break;

			case 'cm' :
				$canvas_x = $size_x = $canvas_y = $size_y = 1;
			break; //Center middle
		}

		//If this is the corner or circle, zoom to apply resampling later for smoother corners
		if(preg_match('/^[tb][lr]$/', $param['place']) || $param['place'] == 'circle')
		{
			$canvas_x *= self::$_zoom;
			$canvas_y *= self::$_zoom;

			$size_x *= self::$_zoom;
			$size_y *= self::$_zoom;

			if($end_x) $end_x *= self::$_zoom;
			if($end_y) $end_y *= self::$_zoom;
		}
		else
		{
			if($end_x) $end_x++;
			if($end_y) $end_y++;
		}

		$image = imagecreatetruecolor($canvas_x, $canvas_y); //Create the image object

		//Set alpha states
		imagealphablending($image, false);
		imagesavealpha($image, true);

		$transparent = imagecolorallocatealpha($image, 0, 0, 0, 127); //Allocate complete transparency color
		$shadow = $param['place'] == 'circle' ? $color : [0, 0, 0]; //Shadow color

		//Allocate the given color to the image object
		$color = imagecolorallocatealpha($image, $color[0], $color[1], $color[2], $through);
		$line = imagecolorallocatealpha($image, $outline[0], $outline[1], $outline[2], $through);

		if($param['shadow'] || $param['place'] == 'circle')
		{
			$bit = self::$_depth % $param['shadow']; //Remaining value of the division
			$step = (self::$_depth - $bit) / $param['shadow']; //Have grandient color for the shadow

			for($i = 0; $i < $param['shadow']; $i++) //Allocate all the shadow colors to the image
				$gradient[$i] = imagecolorallocatealpha($image, $shadow[0], $shadow[1], $shadow[2], $i * $step + 127 - self::$_depth + $bit);
		}

		if($param['place'] == 'circle') //For a single circle
		{
			imagefilledrectangle($image, 0, 0, $canvas_x, $canvas_y, $transparent); //Have a complete transparent block first

			for($i = 1; $i <= $param['shadow']; $i++)
			{
				$adjust = ($i - 1) * 2 * self::$_zoom; //Shape adjustment

				imagefilledellipse($image, $canvas_x / 2, $canvas_y / 2, $canvas_x - $adjust, $canvas_y - $adjust, $gradient[$param['shadow'] - $i]);
				imagefilledellipse($image, $canvas_x / 2, $canvas_y / 2, $canvas_x - $adjust, $canvas_y - $adjust, $gradient[$param['shadow'] - $i]);
				imagefilledellipse($image, $canvas_x / 2, $canvas_y / 2, $canvas_x - $adjust, $canvas_y - $adjust, $gradient[$param['shadow'] - $i]);
			}

			self::_resample($image, $canvas_x, $canvas_y, $size_x, $size_y); //Shrink back to normal size
		}
		elseif(preg_match('/^[tb][lr]$/', $param['place'])) //If this includes a corner
		{
			if($param['round']) //If it should have a rounded corner
			{
				imagefilledrectangle($image, 0, 0, $canvas_x, $canvas_y, $transparent); //Have a complete transparent block first

				if($param['shadow']) //For corners those need rounded shadows
				{
					for($i = 1; $i <= $param['shadow']; $i++) //For every ring of shadows
					{
						$adjust = ($i - 1) * 2 * self::$_zoom; //Shape adjustment

						switch($param['place'])
						{
							case 'tr' :
								imagefilledellipse($image, 0, $canvas_y, $canvas_x * 2 - $adjust, $canvas_y * 2 - $adjust, $gradient[$param['shadow'] - $i]);
							break;

							case 'bl' :
								imagefilledellipse($image, $canvas_x, 0, $canvas_x * 2 - $adjust, $canvas_y * 2 - $adjust, $gradient[$param['shadow'] - $i]);
							break;

							case 'br' :
								imagefilledellipse($image, 0, 0, $canvas_x * 2 - $adjust, $canvas_y * 2 - $adjust, $gradient[$param['shadow'] - $i]);
							break;
						}
					}
				}

				//Create a pie shape of a border color
				imagefilledarc($image, $start_x * self::$_zoom, $start_y * self::$_zoom, $size_x * 2, $size_y * 2, $angle, $angle + 90, $line, IMG_ARC_PIE);
				$space = self::$_border * 2 * self::$_zoom; //Have a space for borders (NOTE : Have double size border since, resampling a curve will shrink the size a little)

				//Create a pie shape that is a little smaller with the actual translucent color
				imagefilledarc($image, $start_x * self::$_zoom, $start_y * self::$_zoom, $size_x * 2 - $space, $size_y * 2 - $space, $angle, $angle + 90, $color, IMG_ARC_PIE);
			}
			else //For a rectangular corner
			{
				imagefilledrectangle($image, 0, 0, $size_x, $size_y, $line); //Create the border color shape

				//Override the inner part with the actual translucent color
				imagefilledrectangle($image, 0 + $start_x * self::$_zoom, 0 + $start_y * self::$_zoom, $size_x - $end_x, $size_y - $end_y, $color);
			}

			$mark = imagecolorallocatealpha($image, $mark[0], $mark[1], $mark[2], $through);

			switch($param['place']) //For bottom right and upper right, add an indicator for click action
			{
				case 'tr' : //Toolbar hide/show indicator
					imagefilledarc($image, $canvas_x / 4.5, $canvas_y / 1.7, $canvas_x / 4, $canvas_y / 2, 0, 360, $mark, IMG_ARC_PIE);
				break;

				case 'br' : //Window resize indicator
					imagefilledpolygon($image, [0, $canvas_y / 4, $canvas_x / 4, 0, $canvas_x / 3, $canvas_y / 3], 3, $mark);
				break;
			}

			self::_resample($image, $canvas_x, $canvas_y, $size_x, $size_y); //Shrink back to normal size

			if($param['shadow'] && !$param['round']) //If it should have shadows, add them to the appropriate edges
			{
				switch($param['place'])
				{
					case 'tr' :
						imagefilledrectangle($image, $size_x, 0, $canvas_x, $canvas_y, $transparent);
						for($i = 0; $i < $param['shadow']; $i++) imageline($image, $canvas_x - $param['shadow'] + $i, $i, $canvas_x - $param['shadow'] + $i, $canvas_y, $gradient[$i]);
					break;

					case 'br' :
						for($i = 0; $i < $param['shadow']; $i++)
						{
							imageline($image, $canvas_x - $param['shadow'] + $i, 0, $canvas_x - $param['shadow'] + $i, $canvas_y, $gradient[$i]);
							imageline($image, 0, $canvas_y - $param['shadow'] + $i, $canvas_x, $canvas_y - $param['shadow'] + $i, $gradient[$i]);
						}
					break;

					case 'bl' :
						imagefilledrectangle($image, 0, $canvas_y - $param['shadow'], $param['shadow'], $canvas_y, $transparent);
						for($i = 0; $i < $param['shadow']; $i++) imageline($image, 0 + $i, $canvas_y - $param['shadow'] + $i, $canvas_x, $canvas_y - $param['shadow'] + $i, $gradient[$i]);
					break;
				}
			}
		}
		else //For other straight line parts
		{
			imagefilledrectangle($image, 0, 0, $canvas_x, $canvas_y, $line); //Fill with border color first
			imagefilledrectangle($image, 0 + $start_x, 0 + $start_y, $size_x - $end_x, $size_y - $end_y, $color); //Fill in the window pane color, leaving space for the border

			if($param['shadow'])
			{
				switch($param['place']) //For places those need shadows
				{
					case 'bm' :
						for($i = 0; $i < $param['shadow']; $i++) imageline($image, 0, $canvas_y - $param['shadow'] + $i, 1, $canvas_y - $param['shadow'] + $i, $gradient[$i]);
					break;

					case 'cr' :
						for($i = 0; $i < $param['shadow']; $i++) imageline($image, $canvas_x - $param['shadow'] + $i, 0, $canvas_x - $param['shadow'] + $i, 1, $gradient[$i]);
					break;
				}
			}
		}

		ob_start(); //Start output buffering to capture the image content

		imagepng($image); //Capture the image but do not send it yet
		imagedestroy($image); //Destroy the created image

		$display = ob_get_contents(); //Get the image data
		ob_end_clean(); //Clean out the buffer and send it out

		$system->cache_set($id, $display, false, $system->system['id']); //Cache the image
		return $display;
	}

	public static function thumbnail(&$system, $name, $header = false) //Generates a jpeg thumbnail and returns the path
	{
		$log = $system->log(__METHOD__);

		if(!$system->is_path($name) || !preg_match('/\.jpg$/', $name) || strstr($name, '..')) return $log->param();
		if(!$system->file_readable($name)) return false;

		if($header) header('Content-Type: image/jpeg'); //Set header if specified

		$id = 'thumbnail/' . md5($name) . '.jpg'; //Cache name
		if($cache = $system->cache_get($id, false, $system->system['id'])) return $cache; //Use cache if it exists

		$size = getimagesize($name);
		if(!$size) return false; //If not a valid image, quit

		$target = imagecreatetruecolor(self::$_thumbnail[0], self::$_thumbnail[1]);
		$source = imagecreatefromjpeg($name); //Create the original image handler

		//Resize the image to configured thumbnail size
		imagecopyresampled($target, $source, 0, 0, 0, 0, self::$_thumbnail[0], self::$_thumbnail[1], $size[0], $size[1]);
		imagedestroy($source);

		ob_start();

		imagejpeg($target);
		imagedestroy($target);

		$image = ob_get_contents(); //Get the image data
		ob_end_clean();

		//Cache the image (No need for compressed version as it will make no difference)
		$system->cache_set($id, $image, false, $system->system['id']);

		return $image;
	}
}
