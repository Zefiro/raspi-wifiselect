#!/bin/bash

USBPATH=/media/auto/usbstick
DIR=${USBPATH}/raspi
MARKER=${DIR}/igor
ROOTSCRIPT=${DIR}/autorun.sh
WIFIFILE=${DIR}/wifi.txt
WFCFILE=${USBPATH}/SMRTNTKY/WSETTING.WFC
OWNDIR=`dirname $BASH_SOURCE`

autorun() {
    /usr/bin/logger -t usbauto Running autorun with ${1}, ${2}
    # give mount some time, just to be sure
    sleep 2

    if [ -f ${ROOTSCRIPT} ]; then
	if [ -f ${MARKER} ]; then
		/bin/bash ${ROOTSCRIPT} > ${DIR}/stdout_autorun.txt 2> ${DIR}/stderr_autorun.txt
	fi
    fi

    if [ -f ${WIFIFILE} ]; then
	$OWNDIR/wifiselect.js USB > ${DIR}/stdout_wifi.txt 2> ${DIR}/stderr_wifi.txt
    fi

    if [ -f ${WFCFILE} ]; then
	if [ ! -d ${DIR} ]; then mkdir ${DIR}; fi
	$OWNDIR/wifiselect.js WFC > ${DIR}/stdout_wfc.txt 2> ${DIR}/stderr_wfc.txt
    fi
}

autorun $@ &
