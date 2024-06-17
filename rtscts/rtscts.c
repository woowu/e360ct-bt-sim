#include <unistd.h>
#include <string.h>
#include <stdlib.h>
#include <termios.h>
#include <fcntl.h>
#include <sys/ioctl.h>
#include <stdio.h>

void pin_change(int fd, int *pin, int level)
{
    int tio_stat;

    printf("set pin %d to %d\n", *pin, level);
    ioctl(fd, level == 0 ? TIOCMBIC : TIOCMBIS, pin);
    ioctl(fd, TIOCMGET, &tio_stat);
    printf("pin %d: %d\n", *pin, (tio_stat & *pin) ? 1 : 0);
}

int main(int argc, char **argv)
{
    const char *pin_name = NULL;
    const char *dev = NULL;
    int set_level = -1;
    int fd;
    int tio_bit;
    int tio_stat;
    char c;

    while ((c = getopt(argc, argv, "d:p:s:")) != -1) {
        switch (c) {
            case 'd':
                dev = optarg;
                break;
            case 'p':
                pin_name = optarg;
                break;
            case 's':
                set_level = atoi(optarg);
                break;
        }
    }
    if (argv[optind] != NULL) {
        printf("extra arguments\n");
        return 1;
    }
    if (! dev) {
        printf("use -d to specify serial device name\n");
        return 1;
    }
    if (! pin_name) {
        printf("use -p to specify modem pin name\n");
        return 1;
    }

    if (! strcmp(pin_name, "rts"))
        tio_bit = TIOCM_RTS;
    else if (! strcmp(pin_name, "cts"))
        tio_bit = TIOCM_CTS;
    else {
        printf("only rts/cts supported\n");
        return 1;
    }

    if (set_level != -1 && tio_bit == TIOCM_CTS) {
        printf("cts is input, cannot be set\n");
        return 1;
    }

    fd = open(dev, O_RDONLY);

    /* read pin status
     */
    if (set_level == -1) {
        ioctl(fd, TIOCMGET, &tio_stat);
        printf("pin %d: %d\n", tio_bit, (tio_stat & tio_bit) ? 1 : 0);
    } else if (set_level == 1 || set_level == 0)
        pin_change(fd, &tio_bit, set_level);

    /* if I close the device file, the pin value will be reset
     */
    if (set_level == 0 || set_level == 1) getchar();
    close(fd);

    return 0;
}
