# raspi-wifiselect
Imagine a Raspi-based wifi-enabled appliance, headless, just add power. When you bring it to a friend, how can you include it in the Wifi? How to add the password to it? Because obviously your friends use PSK/WPA2 on their wifi, otherwise they wouldn't be your friends. And naturally they share it with you. But how to share it with your raspi?

### Manual Way: SD Card
  * open the appliance and remove the SD card
  * use a computer with SD card reader and extfs4 support (e.g. laptop with Linux live CD)
  * use the standard commandline way of adding a wifi network on Raspbian: scan for available networks, call *wpa_passphrase* with the SSID and enter the password, then add it's output to the *wpa_supplicant.conf* file
```
iwlist wlan0 scanning|grep ESSID
wpa_passphrase <SSID> >> /etc/wpa_supplicant/wpa_supplicant.conf
```
  * re-insert SD card into the Raspi and close the appliance

### Nicer Way: USB Stick
  * Preparation (once): Set up the wifiselect.js helper using the below instructions
  * attach USB stick containing a text file */raspi/wifi.txt* containing a line '*scan*'
  * wait ~30sec, unplug it and plug it into any computer with USB port and a text editor
  * the */raspi/wifi.txt* file now contains a list of found WLANS. Add the password into the one to be used
  * Safely unplug the USB stick (otherwise Linux might complain and refuse to auto-mount it?)
  * attach USB stick and wait ~30sec before unplugging again
  * if successful, Raspi should now appear in Wifi and has it's DynDNS set correctly
  * otherwise, look into files */raspi/stdout_wifi.txt* and */raspi/stderr_wifi.txt* on the USB stick

### Alternative: Tethering Hotspot
  * **TODO: this is not implemented yet**
  * Idea: create a Wifi hotspot using smartphone tethering (only works if smartphone has Internet, e.g. won't work outside Germany w/o data roaming), then select SSID & provide password via a hosted webpage
  * Available
    * script is running when network connectivity is added if it is placed in */etc/network/if-up.d/* (really? didn't work for me, needed to add it to */etc/network/interfaces* explicitely)
    * some supports already included in *wifiselect.js*, but not finished
    * Smartphone Wifi configured in */etc/wpa_supplicant/wpa_supplicant.conf*, with *priority=1* (assuming all other networks have higher priority assigned, this will only be used if no other connection is available)
  * Missing
    * define protocol between *wifiselect.js* and webpage (probably JSON, what fields?)
    * create PHP(?) server page on some server you happen to have access to, needs database (or textfile?) backend and admin UI
    * enhance *wifiselect.js* to actually do the needful

### Alternative: MS Windows 'Export Network Config'
  * Windows offers to export known network configurations to an USB stick
    * The SSID and plaintext password are in an XML file called *SMRTNTKY/WSETTING.WFC*, other files will be added as well (*AUTORUN.INF*, *setupSNK.exe* and folder *SMRTNTKY* with some files in it)
  * On windows, open the properties of the wireless network, tab 'Connections', and select "Copy this network profile to a USB flash drive"
  * plug the USB stick into the Raspi and wait ~30sec

### Push-Button WPS
  * **TODO: not implemented yet**
  * needs a router which supports [Wifi Protected Setup](https://en.wikipedia.org/wiki/Wi-Fi_Protected_Setup), even though it's [insecure](http://www.howtogeek.com/176124/wi-fi-protected-setup-wps-is-insecure-heres-why-you-should-disable-it/)
  * see [Headless wifi via push button WPS](http://www.raspberrypi.org/forums/viewtopic.php?f=63&t=77277)




# Wifiselect Script Setup
  * install node: `apt-get install node`
  * clone this repository onto the Raspi, e.g. to */root/bin* and ensure the scripts are executable
  * in the same directory, install the node modules:
```
npm install q fs path request child-process-promise xml2js
```
  * add a rule to UDEV, e.g. in a file */etc/udev/rules.d/70-persistent-usb_autorun.rules*
```
SUBSYSTEM=="block", KERNEL=="sd*1", ACTION=="add", SYMLINK+="usbstick%n", RUN+="/root/bin/raspi-wifiselect/usb_autorun.sh %E{ID_FS_LABEL} %E{ID_FS_UUID}"
```
this triggers on adding of a new device matching "sd\*1" (e.g. sda1), creating a symlink to ensure it's available at the constant name */dev/usbstick1* (1 = partition number), then runs the autorun script, which will access it
  * **Security Note:** The *autorun.sh* feature will run a user-supplied script with root permissions! It's advised to disable this part of *usb_autorun.sh*
  * Links:
    * [Automatically mount USB external drive with autofs](http://linuxconfig.org/automatically-mount-usb-external-drive-with-autofs)
    * [Automount USB drives with no GUI requirement (halevt replacement)](http://unix.stackexchange.com/questions/11472/automount-usb-drives-with-no-gui-requirement-halevt-replacement)
    * [Autostart script from USB device with Udev](http://www.panticz.de/node/629)
  * install autofs
```
apt-get install autofs
```
    * add in file */etc/auto.master*
```
/media/auto   /etc/auto.ext-usb --timeout=10,defaults,user,exec,uid=1000
```
this will create */media/auto* and automounts when accessed, with umount after 10sec inactivity, and some existing, irrelevant user (uid=1000)
    * create file */etc/auto.ext-usb*
```
usbstick            -fstype=auto           :/dev/usbstick1
```
now */media/auto/usbstick* will automount after it's being accessed, e.g. by the *usb_autorun.sh* script, and then being umounted again

# TODO
  * not usable for hidden SSIDs. Perhaps look at [this script](http://www.linuxquestions.org/questions/linux-general-1/wifi-connect-script-tested-in-ubuntu-772646/) for inspiration?
  * create a separate config file, which isn't in the repository, to password-protect the *autorun.sh* script, 
  * add support for Raspi A+, which has only one USB slot. The current script requires to have the USB stick and the Wifi available at the same time.
