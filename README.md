# homebridge-augustlock

@julianfez and @msutara did and excellent work creating the original version of this plugin, however, I couldn't make it work on my system, mostly due to the way August handles the verification of new systems interacting with it. 
So I started this fork to track my attempt to make it work.

As of today, I would call this a working prototype. It can connect and authenticate to August server, it's persistent (no need to re-authenticate every restart) and it's able to report and change status, including battery level. But the code must be cleaned up as it contains shortcuts made for it to work and allow me to test it.

I'll try to populate the Wiki with information on how to install and use it.
